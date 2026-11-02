/**
 * priority-ui-info-field: createInfoField() part 7 of 8.
 * The body of createInfoField runs in order across these parts; its locals live on the per-call state object (M).
 * Order and shared names: see priority-ui-info-field.parts.json and docs/architecture.md.
 */
(function (global) {
  'use strict';

  var S = (global.PriorityUIParts = global.PriorityUIParts || {});
  var P = (global.PriorityUIPartsMountCreateInfoField = global.PriorityUIPartsMountCreateInfoField || { list: [] });

  P.list.push({
    define: function (M) {
    M.renderLabels = function renderLabels() {
      M.labelsEl.replaceChildren();

      if (M.labels.length) {
        M.labels.forEach(function (label) {
          var name = M.labelDisplayName(label);
          var hex = M.labelColorHex(label.color);
          var labelId = label && label.id != null ? String(label.id) : '';
          var isEditing =
            !!M.labelsColorEditId &&
            labelId &&
            String(M.labelsColorEditId) === labelId;
          var canEditLabel =
            !!labelId &&
            !!(M.onLabelColorChange || M.onLabelRename || M.onLabelDelete);
          var chip = document.createElement('span');
          chip.className = 'info-label';
          if (isEditing) chip.classList.add('is-editing-color');
          chip.style.setProperty('--label-color', hex);
          chip.style.setProperty(
            '--label-fg',
            M.labelNeedsDarkText(hex) ? '#172b4d' : '#ffffff'
          );
          chip.title = name;
          chip.setAttribute('aria-label', name);

          var text = document.createElement('span');
          text.className = 'info-label-name';
          text.textContent = name;
          chip.appendChild(text);

          var actions = document.createElement('span');
          actions.className = 'info-label-actions';

          if (canEditLabel) {
            var editBtn = document.createElement('button');
            editBtn.type = 'button';
            editBtn.className = 'info-label-edit';
            editBtn.setAttribute(
              'aria-label',
              'Modifier l\u2019\u00e9tiquette\u00a0: ' + name
            );
            editBtn.title = 'Modifier l\u2019\u00e9tiquette';
            editBtn.innerHTML = '<i class="ti ti-pencil" aria-hidden="true"></i>';
            editBtn.disabled = M.labelsBusy;
            editBtn.setAttribute('aria-expanded', isEditing ? 'true' : 'false');
            editBtn.addEventListener('click', function (event) {
              event.preventDefault();
              event.stopPropagation();
              M.setLabelsColorPickerOpen(label.id);
            });
            actions.appendChild(editBtn);
          }

          if (M.onLabelRemove) {
            var clearBtn = document.createElement('button');
            clearBtn.type = 'button';
            clearBtn.className = 'info-label-clear';
            clearBtn.setAttribute(
              'aria-label',
              'Retirer l\u2019\u00e9tiquette\u00a0: ' + name
            );
            clearBtn.title = 'Retirer de cette carte';
            clearBtn.innerHTML = '<i class="ti ti-x" aria-hidden="true"></i>';
            clearBtn.disabled = M.labelsBusy;
            clearBtn.addEventListener('click', function (event) {
              event.preventDefault();
              event.stopPropagation();
              if (M.labelsColorEditId) M.setLabelsColorPickerOpen('');
              M.removeLabelFromCard(label);
            });
            actions.appendChild(clearBtn);
          }

          if (actions.childNodes.length) chip.appendChild(actions);
          if (
            global.ContextMenu &&
            typeof global.ContextMenu.bind === 'function' &&
            typeof global.ContextMenu.buildInfoChipItems === 'function'
          ) {
            ContextMenu.bind(chip, function () {
              return ContextMenu.buildInfoChipItems({
                kind: 'label',
                onEdit: canEditLabel
                  ? function () {
                      M.setLabelsColorPickerOpen(label.id);
                    }
                  : null,
                onRemove: M.onLabelRemove
                  ? function () {
                      if (M.labelsColorEditId) M.setLabelsColorPickerOpen('');
                      M.removeLabelFromCard(label);
                    }
                  : null,
              });
            });
          }
          M.labelsEl.appendChild(chip);
        });
      }

      var canAdd = !!M.onLabelAdd || !!M.onLabelCreate;
      M.labelsAddBtn.hidden = !canAdd;
      M.labelsAddBtn.disabled = M.labelsBusy || !canAdd || !!M.labelsColorEditId;
      if (M.labelsPickerOpen) M.renderLabelsPicker();
      if (M.labelsColorEditId) M.renderLabelsColorPicker();
      else {
        M.labelsColorPicker.hidden = true;
        M.labelsColorPicker.replaceChildren();
      }
      M.renderLabelSuggestions();
    };
    M.setTaskTypesStatus = function setTaskTypesStatus(text, tone) {
      M.taskTypesStatus.textContent = text || '';
      M.taskTypesStatus.hidden = !text;
      M.taskTypesStatus.classList.toggle('is-error', tone === 'error');
      M.taskTypesStatus.classList.toggle('is-saving', tone === 'saving');
    };
    M.clearTaskTypesPickerPosition = function clearTaskTypesPickerPosition() {
      M.taskTypesPicker.classList.remove('is-viewport-fixed');
      M.taskTypesPicker.style.position = '';
      M.taskTypesPicker.style.top = '';
      M.taskTypesPicker.style.left = '';
      M.taskTypesPicker.style.right = '';
      M.taskTypesPicker.style.bottom = '';
      M.taskTypesPicker.style.maxHeight = '';
      M.taskTypesPicker.style.width = '';
    };
    M.positionTaskTypesPicker = function positionTaskTypesPicker() {
      if (!M.taskTypesPickerOpen || M.taskTypesPicker.hidden) return;
      var margin = 8;
      var gap = 4;
      var vw = window.innerWidth || document.documentElement.clientWidth || 0;
      var vh = window.innerHeight || document.documentElement.clientHeight || 0;
      if (vw < 40 || vh < 40) return;

      M.clearTaskTypesPickerPosition();
      M.taskTypesPicker.classList.add('is-viewport-fixed');
      M.taskTypesPicker.style.position = 'fixed';
      M.taskTypesPicker.style.visibility = 'hidden';
      M.taskTypesPicker.style.top = '0';
      M.taskTypesPicker.style.left = '0';

      var anchor = M.taskTypesAddBtn.getBoundingClientRect();
      var maxW = Math.min(280, Math.max(160, vw - margin * 2));
      M.taskTypesPicker.style.width = maxW + 'px';

      var spaceBelow = Math.max(0, vh - anchor.bottom - gap - margin);
      var spaceAbove = Math.max(0, anchor.top - gap - margin);
      var preferBelow =
        spaceBelow >= 160 || spaceBelow >= spaceAbove || spaceAbove < 120;
      var availableH = preferBelow ? spaceBelow : spaceAbove;
      var maxH = Math.max(120, Math.min(320, availableH || vh - margin * 2));
      M.taskTypesPicker.style.maxHeight = maxH + 'px';

      var pw = M.taskTypesPicker.offsetWidth || maxW;
      var ph = M.taskTypesPicker.offsetHeight || Math.min(maxH, 240);

      var top = preferBelow ? anchor.bottom + gap : anchor.top - gap - ph;
      // If above would clip the top, move lower; always clamp into the viewport.
      if (top < margin) top = margin;
      if (top + ph > vh - margin) {
        top = Math.max(margin, vh - ph - margin);
      }

      // Prefer aligning to the button; shift left when the right edge overflows.
      var left = anchor.left;
      if (left + pw > vw - margin) {
        left = vw - pw - margin;
      }
      // Prefer growing left from the button's right edge when still overflowing.
      if (left < margin) {
        left = Math.max(margin, Math.min(anchor.right - pw, vw - pw - margin));
      }
      left = Math.max(margin, Math.min(left, vw - pw - margin));

      M.taskTypesPicker.style.top = Math.round(top) + 'px';
      M.taskTypesPicker.style.left = Math.round(left) + 'px';
      M.taskTypesPicker.style.visibility = '';
    };
    M.setTaskTypesPickerOpen = function setTaskTypesPickerOpen(open) {
      M.taskTypesPickerOpen = !!open;
      M.taskTypesPicker.hidden = !M.taskTypesPickerOpen;
      M.taskTypesAddWrap.classList.toggle('is-open', M.taskTypesPickerOpen);
      M.taskTypesAddBtn.setAttribute(
        'aria-expanded',
        M.taskTypesPickerOpen ? 'true' : 'false'
      );
      if (M.taskTypesPickerOpen) {
        M.randomizeTaskTypesCreateIcon();
        M.setTaskTypesIconPickerOpen(false);
        M.renderTaskTypesPicker();
        M.positionTaskTypesPicker();
        requestAnimationFrame(M.positionTaskTypesPicker);
        try {
          M.taskTypesCreateInput.focus();
          M.taskTypesCreateInput.select();
        } catch (e) {
          /* ignore */
        }
      } else {
        M.taskTypesCreateInput.value = '';
        M.setTaskTypesIconPickerOpen(false);
        M.clearTaskTypesPickerPosition();
      }
      M.onLayoutChange();
      if (M.taskTypesPickerOpen) {
        requestAnimationFrame(M.positionTaskTypesPicker);
      }
    };
    M.availableTaskTypeEntries = function availableTaskTypeEntries() {
      var selected = Object.create(null);
      for (var i = 0; i < M.taskTypes.length; i++) selected[M.taskTypes[i]] = true;
      return S.getTaskTypeCatalog().filter(function (entry) {
        return !selected[entry.id];
      });
    };
    M.filteredAvailableTaskTypeEntries = function filteredAvailableTaskTypeEntries(query) {
      var available = M.availableTaskTypeEntries();
      var q = String(query || '')
        .trim()
        .toLocaleLowerCase('fr-FR');
      if (!q) return available;
      return available.filter(function (entry) {
        var label = String(entry.label || '')
          .toLocaleLowerCase('fr-FR');
        var hint = String(entry.hint || '')
          .toLocaleLowerCase('fr-FR');
        return label.indexOf(q) !== -1 || hint.indexOf(q) !== -1;
      });
    };
    M.canOpenTaskTypesPicker = function canOpenTaskTypesPicker() {
      if (!M.onTaskTypesChange) return false;
      return M.availableTaskTypeEntries().length > 0 || !!M.onCustomTaskTypesChange;
    };
    M.syncTaskTypesCreateBtn = function syncTaskTypesCreateBtn() {
      if (!M.onCustomTaskTypesChange) {
        M.taskTypesCreateBtn.disabled = true;
        return;
      }
      var label = (M.taskTypesCreateInput.value || '').trim();
      M.taskTypesCreateBtn.disabled =
        M.taskTypesBusy || !label || label.length > S.MAX_TASK_TYPE_LABEL_LEN;
    };
    M.renderTaskTypesPicker = function renderTaskTypesPicker() {
      M.taskTypesPickerList.replaceChildren();
      // Keep the search field visible whenever the picker can open; only hide
      // create controls when custom types are unavailable.
      M.taskTypesCreateWrap.hidden = false;
      M.taskTypesCreateIconWrap.hidden = !M.onCustomTaskTypesChange;
      M.taskTypesCreateBtn.hidden = !M.onCustomTaskTypesChange;
      M.taskTypesCreateInput.placeholder = M.onCustomTaskTypesChange
        ? 'Rechercher ou cr\u00e9er\u2026'
        : 'Rechercher\u2026';
      M.taskTypesCreateInput.setAttribute(
        'aria-label',
        M.onCustomTaskTypesChange
          ? 'Rechercher ou cr\u00e9er un type de t\u00e2che'
          : 'Rechercher un type de t\u00e2che'
      );
      var query = M.taskTypesCreateInput.value;
      var available = M.filteredAvailableTaskTypeEntries(query);
      var q = String(query || '').trim();
      if (!available.length) {
        var empty = document.createElement('div');
        empty.className = 'info-task-types-picker-empty';
        if (q) {
          empty.textContent = 'Aucun type correspondant';
        } else if (M.onCustomTaskTypesChange) {
          empty.textContent =
            'Tous les types sont s\u00e9lectionn\u00e9s \u2014 cr\u00e9ez-en un nouveau';
        } else {
          empty.textContent = 'Tous les types sont d\u00e9j\u00e0 s\u00e9lectionn\u00e9s';
        }
        M.taskTypesPickerList.appendChild(empty);
      } else {
        available.forEach(function (entry) {
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'info-task-types-picker-option';
          btn.setAttribute('role', 'option');
          btn.disabled = M.taskTypesBusy;
          btn.title = entry.hint || entry.label;
          btn.dataset.taskTypeId = entry.id;

          var head = document.createElement('span');
          head.className = 'info-task-types-picker-option-head';
          head.innerHTML = S.taskTypeIconSvg(entry.id);
          var text = document.createElement('span');
          text.className = 'info-task-types-picker-option-text';
          text.textContent = entry.label;
          head.appendChild(text);
          btn.appendChild(head);

          if (entry.hint) {
            var hint = document.createElement('span');
            hint.className = 'info-task-types-picker-option-hint';
            hint.textContent = entry.hint;
            btn.appendChild(hint);
          }

          btn.addEventListener('click', function () {
            M.addTaskType(entry.id);
          });
          M.taskTypesPickerList.appendChild(btn);
        });
      }
      M.syncTaskTypesCreateBtn();
    };
    M.renderTaskTypes = function renderTaskTypes() {
      M.taskTypesEl.replaceChildren();
      M.taskTypes.forEach(function (id) {
        var label = S.taskTypeLabel(id) || id;
        var hint = S.taskTypeHint(id);
        var chip = document.createElement('span');
        chip.className = 'info-task-type';
        chip.title = hint || label;
        chip.setAttribute('aria-label', label);

        var iconWrap = document.createElement('span');
        iconWrap.className = 'info-task-type-icon-wrap';
        iconWrap.innerHTML = S.taskTypeIconSvg(id);
        chip.appendChild(iconWrap);

        var text = document.createElement('span');
        text.className = 'info-task-type-name';
        text.textContent = label;
        chip.appendChild(text);

        var clearBtn = document.createElement('button');
        clearBtn.type = 'button';
        clearBtn.className = 'info-task-type-clear';
        clearBtn.setAttribute('aria-label', 'Retirer\u00a0: ' + label);
        clearBtn.title = 'Retirer';
        clearBtn.innerHTML = '<i class="ti ti-x" aria-hidden="true"></i>';
        clearBtn.disabled = M.taskTypesBusy;
        clearBtn.addEventListener('click', function (event) {
          event.preventDefault();
          event.stopPropagation();
          M.removeTaskType(id);
        });
        chip.appendChild(clearBtn);
        if (
          global.ContextMenu &&
          typeof global.ContextMenu.bind === 'function' &&
          typeof global.ContextMenu.buildInfoChipItems === 'function'
        ) {
          ContextMenu.bind(chip, function () {
            return ContextMenu.buildInfoChipItems({
              kind: 'task-type',
              onRemove: function () {
                M.removeTaskType(id);
              },
            });
          });
        }
        M.taskTypesEl.appendChild(chip);
      });

      var canAdd = M.canOpenTaskTypesPicker();
      M.taskTypesAddBtn.hidden = !M.onTaskTypesChange;
      M.taskTypesAddBtn.disabled = M.taskTypesBusy || !canAdd;
      if (M.taskTypesPickerOpen) {
        if (!canAdd) M.setTaskTypesPickerOpen(false);
        else {
          M.renderTaskTypesPicker();
          requestAnimationFrame(M.positionTaskTypesPicker);
        }
      }
      M.renderTaskTypeSuggestions();
    };
    M.persistCustomTaskTypes = function persistCustomTaskTypes(nextCustoms, createdEntry) {
      var previous = S.getCustomTaskTypes();
      S.setCustomTaskTypes(nextCustoms);
      M.renderTaskTypes();
      if (!M.onCustomTaskTypesChange) {
        if (createdEntry) M.addTaskType(createdEntry.id);
        return Promise.resolve({ ok: true });
      }
      M.taskTypesBusy = true;
      M.setTaskTypesStatus('', 'saving');
      return Promise.resolve(M.onCustomTaskTypesChange(S.getCustomTaskTypes()))
        .then(function (result) {
          M.taskTypesBusy = false;
          if (result && result.ok === false) {
            S.setCustomTaskTypes(previous);
            M.setTaskTypesStatus('\u00c9chec de l\u2019enregistrement', 'error');
            M.renderTaskTypes();
            M.onLayoutChange();
            return result;
          }
          M.setTaskTypesStatus('', '');
          if (createdEntry) M.addTaskType(createdEntry.id);
          else {
            M.renderTaskTypes();
            M.onLayoutChange();
          }
          return result || { ok: true };
        })
        .catch(function (err) {
          console.error('Info custom task types save failed', err);
          M.taskTypesBusy = false;
          S.setCustomTaskTypes(previous);
          M.setTaskTypesStatus('\u00c9chec de l\u2019enregistrement', 'error');
          M.renderTaskTypes();
          M.onLayoutChange();
          return { ok: false };
        });
    };
    M.submitCreateTaskType = function submitCreateTaskType() {
      if (M.taskTypesBusy || !M.onCustomTaskTypesChange) return;
      var label = (M.taskTypesCreateInput.value || '').trim();
      if (!label) return;
      var draft = S.createCustomTaskType(
        { label: label, icon: M.taskTypesCreateIconKey },
        { apply: false }
      );
      if (!draft) {
        M.setTaskTypesStatus('Ce type existe d\u00e9j\u00e0', 'error');
        return;
      }
      M.taskTypesCreateInput.value = '';
      M.syncTaskTypesCreateBtn();
      M.setTaskTypesIconPickerOpen(false);
      M.persistCustomTaskTypes(S.getCustomTaskTypes().concat([draft]), draft).then(
        function (result) {
          if (!result || result.ok !== false) {
            M.randomizeTaskTypesCreateIcon();
          }
        }
      );
    };
    M.persistTaskTypes = function persistTaskTypes(nextTypes) {
      var previous = M.taskTypes.slice();
      var normalized = S.normalizeTaskTypes(nextTypes);
      M.taskTypes = normalized;
      M.renderTaskTypes();
      if (!M.onTaskTypesChange) {
        M.onLayoutChange();
        return;
      }
      M.taskTypesBusy = true;
      M.setTaskTypesStatus('', 'saving');
      Promise.resolve(M.onTaskTypesChange(normalized.slice()))
        .then(function (result) {
          M.taskTypesBusy = false;
          if (result && result.ok === false) {
            M.taskTypes = previous;
            M.setTaskTypesStatus('\u00c9chec de l\u2019enregistrement', 'error');
            M.renderTaskTypes();
            M.onLayoutChange();
            return;
          }
          M.setTaskTypesStatus('', '');
          M.renderTaskTypes();
          M.scheduleTaskTypeSuggestions(false);
          M.onLayoutChange();
        })
        .catch(function (err) {
          console.error('Info task types save failed', err);
          M.taskTypesBusy = false;
          M.taskTypes = previous;
          M.setTaskTypesStatus('\u00c9chec de l\u2019enregistrement', 'error');
          M.renderTaskTypes();
          M.onLayoutChange();
        });
    };
    M.addTaskType = function addTaskType(id) {
      if (M.taskTypesBusy || !S.isValidTaskTypeId(id)) return;
      if (M.taskTypes.indexOf(id) >= 0) return;
      M.persistTaskTypes(M.taskTypes.concat([id]));
      M.setTaskTypesPickerOpen(false);
    };
    M.removeTaskType = function removeTaskType(id) {
      if (M.taskTypesBusy) return;
      M.persistTaskTypes(
        M.taskTypes.filter(function (entry) {
          return entry !== id;
        })
      );
    };
    M.pruneTaskTypeSuggestions = function pruneTaskTypeSuggestions() {
      var selected = Object.create(null);
      M.taskTypes.forEach(function (id) {
        selected[id] = true;
      });
      var dismissed = Object.create(null);
      M.dismissedTaskTypeSuggestions.forEach(function (id) {
        dismissed[id] = true;
      });
      M.taskTypeSuggestions = M.taskTypeSuggestions.filter(function (row) {
        return (
          row &&
          row.id &&
          S.isValidTaskTypeId(row.id) &&
          !selected[row.id] &&
          !dismissed[row.id]
        );
      });
    };
    M.renderTaskTypeSuggestions = function renderTaskTypeSuggestions() {
      if (!M.taskTypesSuggestListEl || !M.taskTypesSuggestSection) return;
      M.taskTypesSuggestListEl.replaceChildren();
      M.pruneTaskTypeSuggestions();
      if (!M.suggestTaskTypesFn || !M.taskTypeSuggestions.length) {
        M.taskTypesSuggestSection.hidden = true;
        M.onLayoutChange();
        return;
      }
      M.taskTypesSuggestSection.hidden = false;
      M.taskTypeSuggestions.forEach(function (row) {
        var entry = S.getTaskTypeEntry(row.id);
        var label = (entry && entry.label) || row.label || row.id;
        var hint = (entry && entry.hint) || row.hint || '';

        var chip = document.createElement('span');
        chip.className = 'info-task-types-suggestion-chip';
        chip.setAttribute('role', 'listitem');

        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'info-task-types-suggestion';
        btn.title = hint
          ? 'Ajouter\u00a0: ' + label + ' \u2014 ' + hint
          : 'Ajouter\u00a0: ' + label;
        btn.disabled = M.taskTypesBusy;
        btn.dataset.taskTypeId = row.id;
        btn.innerHTML =
          S.taskTypeIconSvg(row.id, 'info-task-type-icon') +
          '<span class="info-task-types-suggestion-label">' +
          S.escapeHtml(label) +
          '</span>';
        btn.addEventListener('click', function () {
          M.addTaskType(row.id);
        });

        var dismissBtn = document.createElement('button');
        dismissBtn.type = 'button';
        dismissBtn.className = 'info-task-types-suggestion-dismiss';
        dismissBtn.setAttribute('aria-label', 'Ignorer la suggestion ' + label);
        dismissBtn.title = 'Ignorer';
        dismissBtn.disabled = M.taskTypesBusy;
        dismissBtn.innerHTML = '<i class="ti ti-x" aria-hidden="true"></i>';
        dismissBtn.addEventListener('click', function (event) {
          event.preventDefault();
          event.stopPropagation();
          M.dismissTaskTypeSuggestion(row.id);
        });

        chip.appendChild(btn);
        chip.appendChild(dismissBtn);
        M.taskTypesSuggestListEl.appendChild(chip);
      });
      M.onLayoutChange();
    };
    M.persistDismissedTaskTypeSuggestions = function persistDismissedTaskTypeSuggestions(nextIds) {
      var previous = M.dismissedTaskTypeSuggestions.slice();
      var normalized = S.normalizeTaskTypes(nextIds);
      M.dismissedTaskTypeSuggestions = normalized;
      M.pruneTaskTypeSuggestions();
      M.renderTaskTypeSuggestions();
      if (!M.onDismissedTaskTypeSuggestionsChange) {
        return Promise.resolve({ ok: true, changed: false });
      }
      return Promise.resolve(
        M.onDismissedTaskTypeSuggestionsChange(normalized.slice())
      )
        .then(function (result) {
          if (result && result.ok === false) {
            M.dismissedTaskTypeSuggestions = previous;
            M.renderTaskTypeSuggestions();
          }
          return result || { ok: true, changed: true };
        })
        .catch(function (err) {
          console.error('Dismiss task type suggestion failed', err);
          M.dismissedTaskTypeSuggestions = previous;
          M.renderTaskTypeSuggestions();
          throw err;
        });
    };
    M.dismissTaskTypeSuggestion = function dismissTaskTypeSuggestion(id) {
      if (!S.isValidTaskTypeId(id)) return;
      if (M.dismissedTaskTypeSuggestions.indexOf(id) >= 0) {
        M.pruneTaskTypeSuggestions();
        M.renderTaskTypeSuggestions();
        return;
      }
      M.persistDismissedTaskTypeSuggestions(
        M.dismissedTaskTypeSuggestions.concat([id])
      );
    };
    M.taskTypeSuggestionsContextKey = function taskTypeSuggestionsContextKey() {
      var title = (M.titleInput.value || '').trim() || M.titleText || '';
      var desc = (M.descInput.value || '').trim() || M.descText || '';
      var existing = M.taskTypes.slice().sort().join(',');
      return title + '\u0001' + desc + '\u0001' + existing;
    };
    M.refreshTaskTypeSuggestions = function refreshTaskTypeSuggestions(force) {
      if (!M.suggestTaskTypesFn) {
        M.taskTypeSuggestions = [];
        M.taskTypeSuggestionsLoading = false;
        M.taskTypeSuggestionsKey = '';
        M.renderTaskTypeSuggestions();
        return Promise.resolve();
      }
      if (M.taskTypes.length >= S.getTaskTypeCatalog().length) {
        M.taskTypeSuggestions = [];
        M.renderTaskTypeSuggestions();
        return Promise.resolve();
      }
      var title = (M.titleInput.value || '').trim() || M.titleText || '';
      var desc = (M.descInput.value || '').trim() || M.descText || '';
      if (!title && !desc) {
        M.taskTypeSuggestions = [];
        M.renderTaskTypeSuggestions();
        return Promise.resolve();
      }
      var key = M.taskTypeSuggestionsContextKey();
      if (!force && key === M.taskTypeSuggestionsKey) {
        M.renderTaskTypeSuggestions();
        return Promise.resolve();
      }
      var seq = ++M.taskTypeSuggestionsSeq;
      M.taskTypeSuggestionsLoading = true;
      M.taskTypeSuggestionsKey = key;
      return Promise.resolve()
        .then(function () {
          return M.suggestTaskTypesFn({
            force: !!force,
            cardName: title,
            cardDesc: desc,
            existingTypes: M.taskTypes.slice()
          });
        })
        .then(function (list) {
          if (seq !== M.taskTypeSuggestionsSeq) return;
          var selected = Object.create(null);
          M.taskTypes.forEach(function (id) {
            selected[id] = true;
          });
          var dismissed = Object.create(null);
          M.dismissedTaskTypeSuggestions.forEach(function (id) {
            dismissed[id] = true;
          });
          var seen = Object.create(null);
          M.taskTypeSuggestions = Array.isArray(list)
            ? list
                .filter(function (row) {
                  if (!row || !row.id || !S.isValidTaskTypeId(row.id)) return false;
                  if (selected[row.id] || dismissed[row.id] || seen[row.id]) {
                    return false;
                  }
                  seen[row.id] = true;
                  return true;
                })
                .slice(0, 3)
            : [];
          M.taskTypeSuggestionsLoading = false;
          M.renderTaskTypeSuggestions();
        })
        .catch(function (err) {
          console.error('Info task type suggestions failed', err);
          if (seq !== M.taskTypeSuggestionsSeq) return;
          M.taskTypeSuggestionsLoading = false;
          M.taskTypeSuggestions = [];
          M.renderTaskTypeSuggestions();
        });
    };
    M.scheduleTaskTypeSuggestions = function scheduleTaskTypeSuggestions(force) {
      if (!M.suggestTaskTypesFn) return;
      if (M.taskTypeSuggestionsTimer) {
        clearTimeout(M.taskTypeSuggestionsTimer);
        M.taskTypeSuggestionsTimer = null;
      }
      M.taskTypeSuggestionsTimer = setTimeout(function () {
        M.taskTypeSuggestionsTimer = null;
        M.refreshTaskTypeSuggestions(!!force);
      }, force ? 0 : 280);
    };
    M.changeLabelColor = function changeLabelColor(label, colorKey) {
      if (!M.onLabelColorChange || M.labelsBusy || !label || !label.id) return;
      var nextColor = M.labelBaseColor(colorKey);
      if (!nextColor || !Object.prototype.hasOwnProperty.call(M.LABEL_COLOR_HEX, nextColor)) {
        return;
      }
      if (M.labelBaseColor(label.color) === nextColor) {
        M.setLabelsColorPickerOpen('');
        return;
      }
      M.flushLabelRenameIfNeeded(label.id);
      var previousColor = label.color;
      M.labelsBusy = true;
      M.setLabelsStatus('', 'saving');
      M.applyLabelColorLocally(label.id, nextColor);
      M.renderLabels();
      Promise.resolve(
        M.onLabelColorChange({
          id: label.id,
          color: nextColor,
          label: label
        })
      )
        .then(function (result) {
          M.labelsBusy = false;
          if (result && result.ok === false) {
            M.applyLabelColorLocally(label.id, previousColor);
            if (result.reason === 'not-authorized' || result.reason === 'no-app-key') {
              M.setAuthHint(result.reason);
              M.setLabelsStatus('', 'error');
            } else {
              M.setLabelsStatus('\u00c9chec de la couleur', 'error');
            }
            M.renderLabels();
            M.onLayoutChange();
            return result;
          }
          var savedColor =
            result && result.label && result.label.color != null
              ? result.label.color
              : result && result.color != null
                ? result.color
                : nextColor;
          M.applyLabelColorLocally(label.id, savedColor);
          M.setAuthHint('');
          M.setLabelsStatus('', 'ok');
          M.labelsColorEditId = '';
          if (M.labelsRenameId === String(label.id)) {
            M.cancelLabelRename({ render: false });
          }
          M.renderLabels();
          setTimeout(function () {
            if (M.labelsStatus.classList.contains('is-ok')) M.setLabelsStatus('');
          }, 1400);
          M.onLayoutChange();
          return result;
        })
        .catch(function (err) {
          M.labelsBusy = false;
          M.applyLabelColorLocally(label.id, previousColor);
          console.error('Info label color change failed', err);
          M.setLabelsStatus('\u00c9chec de la couleur', 'error');
          M.renderLabels();
          M.onLayoutChange();
        });
    };
    M.createLabelFromPicker = function createLabelFromPicker() {
      if (!M.onLabelCreate || M.labelsBusy) return;
      var name = String(M.labelsSearchInput.value || '').trim();
      if (!name || M.boardHasLabelName(name)) return;
      M.labelsBusy = true;
      M.setLabelsStatus('', 'saving');
      M.renderLabels();
      Promise.resolve(
        M.onLabelCreate({
          name: name,
          existingLabels: M.boardLabels.slice()
        })
      )
        .then(function (result) {
          M.labelsBusy = false;
          if (result && result.ok === false) {
            if (result.reason === 'not-authorized' || result.reason === 'no-app-key') {
              M.setAuthHint(result.reason);
              M.setLabelsStatus('', 'error');
            } else if (result.reason === 'empty-name') {
              M.setLabelsStatus('Nom requis', 'error');
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
                  color: created.color != null ? created.color : null,
                  idBoard: created.idBoard
                }
              ]);
            }
            if (!M.selectedLabelIds()[createdId]) {
              M.labels = M.labels.concat([
                {
                  id: created.id,
                  name: typeof created.name === 'string' ? created.name : name,
                  color: created.color != null ? created.color : null,
                  idBoard: created.idBoard
                }
              ]);
            }
          }
          M.setAuthHint('');
          M.setLabelsStatus('', 'ok');
          M.setLabelsPickerOpen(false);
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
          console.error('Info label create failed', err);
          M.setLabelsStatus('\u00c9chec de la cr\u00e9ation', 'error');
          M.renderLabels();
          M.onLayoutChange();
        });
    };
    M.addLabelFromPicker = function addLabelFromPicker(label) {
      if (!M.onLabelAdd || M.labelsBusy || !label || !label.id) return;
      var id = String(label.id);
      if (M.selectedLabelIds()[id]) return;
      M.labelsBusy = true;
      M.setLabelsStatus('', 'saving');
      M.renderLabels();
      Promise.resolve(M.onLabelAdd(label))
        .then(function (result) {
          M.labelsBusy = false;
          if (result && result.ok === false) {
            if (result.reason === 'not-authorized' || result.reason === 'no-app-key') {
              M.setAuthHint(result.reason);
              M.setLabelsStatus('', 'error');
            } else {
              M.setLabelsStatus('\u00c9chec de l\u2019ajout', 'error');
            }
            M.renderLabels();
            M.onLayoutChange();
            return result;
          }
          if (!M.selectedLabelIds()[id]) {
            M.labels = M.labels.concat([
              {
                id: label.id,
                name: typeof label.name === 'string' ? label.name : '',
                color: label.color != null ? label.color : null,
                idBoard: label.idBoard
              }
            ]);
          }
          M.labelSuggestions = M.labelSuggestions.filter(function (item) {
            return !(item && String(item.id) === id);
          });
          M.setAuthHint('');
          M.setLabelsStatus('', 'ok');
          M.setLabelsPickerOpen(false);
          M.renderLabels();
          setTimeout(function () {
            if (M.labelsStatus.classList.contains('is-ok')) M.setLabelsStatus('');
          }, 1400);
          M.onLayoutChange();
          return result;
        })
        .catch(function (err) {
          M.labelsBusy = false;
          console.error('Info label add failed', err);
          M.setLabelsStatus('\u00c9chec de l\u2019ajout', 'error');
          M.renderLabels();
          M.onLayoutChange();
        });
    };
    M.removeLabelFromCard = function removeLabelFromCard(label) {
      if (!M.onLabelRemove || M.labelsBusy || !label || !label.id) return;
      var id = String(label.id);
      M.labelsBusy = true;
      M.setLabelsStatus('', 'saving');
      M.renderLabels();
      Promise.resolve(M.onLabelRemove(label))
        .then(function (result) {
          M.labelsBusy = false;
          if (result && result.ok === false) {
            if (result.reason === 'not-authorized' || result.reason === 'no-app-key') {
              M.setAuthHint(result.reason);
              M.setLabelsStatus('', 'error');
            } else {
              M.setLabelsStatus('\u00c9chec du retrait', 'error');
            }
            M.renderLabels();
            M.onLayoutChange();
            return result;
          }
          M.labels = M.labels.filter(function (item) {
            return !(item && String(item.id) === id);
          });
          M.setAuthHint('');
          M.setLabelsStatus('', 'ok');
          M.renderLabels();
          setTimeout(function () {
            if (M.labelsStatus.classList.contains('is-ok')) M.setLabelsStatus('');
          }, 1400);
          M.onLayoutChange();
          return result;
        })
        .catch(function (err) {
          M.labelsBusy = false;
          console.error('Info label remove failed', err);
          M.setLabelsStatus('\u00c9chec du retrait', 'error');
          M.renderLabels();
          M.onLayoutChange();
        });
    };
    M.deleteLabelFromBoard = function deleteLabelFromBoard(label) {
      if (!M.onLabelDelete || M.labelsBusy || !label || !label.id) return;
      var id = String(label.id);
      var name = M.labelDisplayName(label);
      if (
        !window.confirm(
          'Supprimer d\u00e9finitivement l\u2019\u00e9tiquette \u00ab\u00a0' +
            name +
            '\u00a0\u00bb du tableau\u00a0?\nElle sera retir\u00e9e de toutes les cartes.'
        )
      ) {
        return;
      }
      M.labelsBusy = true;
      M.setLabelsStatus('', 'saving');
      M.renderLabels();
      Promise.resolve(M.onLabelDelete(label))
        .then(function (result) {
          M.labelsBusy = false;
          if (result && result.ok === false) {
            if (result.reason === 'not-authorized' || result.reason === 'no-app-key') {
              M.setAuthHint(result.reason);
              M.setLabelsStatus('', 'error');
            } else {
              M.setLabelsStatus('\u00c9chec de la suppression', 'error');
            }
            M.renderLabels();
            M.onLayoutChange();
            return result;
          }
          M.labels = M.labels.filter(function (item) {
            return !(item && String(item.id) === id);
          });
          M.boardLabels = M.boardLabels.filter(function (item) {
            return !(item && String(item.id) === id);
          });
          if (M.labelsColorEditId === id) {
            M.labelsColorEditId = '';
          }
          if (M.labelsRenameId === id) {
            M.labelsRenameId = '';
            M.labelsRenameDraft = '';
          }
          M.setAuthHint('');
          M.setLabelsStatus('', 'ok');
          M.renderLabels();
          setTimeout(function () {
            if (M.labelsStatus.classList.contains('is-ok')) M.setLabelsStatus('');
          }, 1400);
          M.onLayoutChange();
          return result;
        })
        .catch(function (err) {
          M.labelsBusy = false;
          console.error('Info label delete failed', err);
          M.setLabelsStatus('\u00c9chec de la suppression', 'error');
          M.renderLabels();
          M.onLayoutChange();
        });
    };
    M.setParentStatus = function setParentStatus(text, visible) {
      if (!visible || !text) {
        M.parentStatus.hidden = true;
        M.parentStatus.textContent = '';
        return;
      }
      M.parentStatus.hidden = false;
      M.parentStatus.textContent = text;
    };
    M.setParentPickerOpen = function setParentPickerOpen(open) {
      M.parentPickerOpen = !!open;
      M.parentPicker.hidden = !M.parentPickerOpen;
      M.parentPickWrap.classList.toggle('is-open', M.parentPickerOpen);
      M.parentPickBtn.setAttribute('aria-expanded', M.parentPickerOpen ? 'true' : 'false');
      if (!M.parentPickerOpen) {
        M.parentSearchInput.value = '';
        M.setParentStatus('', false);
        M.parentListEl.replaceChildren();
      }
      M.onLayoutChange();
    };
    M.ensureParentBoardCards = function ensureParentBoardCards() {
      if (M.parentBoardCardsCache) return Promise.resolve(M.parentBoardCardsCache);
      if (!M.getBoardCards) return Promise.resolve([]);
      return Promise.resolve()
        .then(function () {
          return M.getBoardCards();
        })
        .then(function (cards) {
          M.parentBoardCardsCache = Array.isArray(cards) ? cards : [];
          return M.parentBoardCardsCache;
        })
        .catch(function (err) {
          console.error('Info parent board cards load failed', err);
          M.parentBoardCardsCache = [];
          return M.parentBoardCardsCache;
        });
    };
    M.parentIdSet = function parentIdSet() {
      var set = Object.create(null);
      M.parentCards.forEach(function (p) {
        if (p && p.id) set[String(p.id)] = true;
      });
      return set;
    };
    M.renderParentPickerList = function renderParentPickerList(cards, query) {
      M.parentListEl.replaceChildren();
      var q = String(query || '')
        .trim()
        .toLowerCase();
      var linked = M.parentIdSet();
      var filtered = (cards || []).filter(function (card) {
        if (!card || !card.id) return false;
        if (linked[String(card.id)]) return false;
        if (!q) return true;
        var name = String(card.name || '').toLowerCase();
        var list = String(card.list || '').toLowerCase();
        return name.indexOf(q) !== -1 || list.indexOf(q) !== -1;
      });
      if (!filtered.length) {
        M.setParentStatus(
          q ? 'Aucune carte correspondante' : 'Aucune carte disponible',
          true
        );
        return;
      }
      M.setParentStatus('', false);
      filtered.slice(0, 40).forEach(function (card) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'info-parent-option';
        btn.setAttribute('role', 'option');
        var nameEl = document.createElement('span');
        nameEl.className = 'info-parent-option-name';
        nameEl.textContent = card.name || 'Carte sans titre';
        btn.appendChild(nameEl);
        if (card.list) {
          var meta = document.createElement('span');
          meta.className = 'info-parent-option-list';
          meta.textContent = card.list;
          btn.appendChild(meta);
        }
        btn.title = 'Lier \u00e0\u00a0: ' + (card.name || 'Carte');
        btn.addEventListener('click', function (event) {
          event.preventDefault();
          event.stopPropagation();
          M.applyParentChange(card);
        });
        M.parentListEl.appendChild(btn);
      });
    };
    M.openParentPicker = function openParentPicker() {
      if (!M.getBoardCards || M.parentBusy) return;
      M.setParentPickerOpen(true);
      M.setParentStatus('Chargement des cartes\u2026', true);
      M.parentListEl.replaceChildren();
      M.ensureParentBoardCards().then(function (cards) {
        if (!M.parentPickerOpen) return;
        M.renderParentPickerList(cards, M.parentSearchInput.value);
        try {
          M.parentSearchInput.focus();
        } catch (e) {
          /* ignore */
        }
        M.onLayoutChange();
      });
    };
    M.buildParentChip = function buildParentChip(parent) {
      var chip = document.createElement('span');
      chip.className = 'info-parent-chip';
      chip.dataset.parentId = parent.id;

      var openBtn = document.createElement('button');
      openBtn.type = 'button';
      openBtn.className = 'info-parent-chip-open';
      openBtn.disabled = M.parentBusy || !M.onOpenParent;
      openBtn.title = M.onOpenParent
        ? 'Ouvrir la t\u00e2che parente'
        : parent.name || '';

      var textEl = document.createElement('span');
      textEl.className = 'info-parent-chip-text';
      var nameEl = document.createElement('span');
      nameEl.className = 'info-parent-chip-name';
      nameEl.textContent = parent.name || 'Carte sans titre';
      textEl.appendChild(nameEl);
      if (parent.list) {
        var listEl = document.createElement('span');
        listEl.className = 'info-parent-chip-list';
        listEl.textContent = parent.list;
        textEl.appendChild(listEl);
      }
      openBtn.appendChild(textEl);

      var clearBtn = document.createElement('button');
      clearBtn.type = 'button';
      clearBtn.className = 'info-parent-clear';
      clearBtn.setAttribute('aria-label', 'Retirer la t\u00e2che parente');
      clearBtn.title = 'Retirer';
      clearBtn.textContent = '\u00d7';
      clearBtn.disabled = M.parentBusy || !M.onParentChange;
      clearBtn.hidden = !M.onParentChange;

      openBtn.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        if (!M.onOpenParent || M.parentBusy || openBtn.disabled) return;
        Promise.resolve(M.onOpenParent(parent.id)).catch(function (err) {
          console.error('Info open parent failed', err);
        });
      });

      clearBtn.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        if (clearBtn.disabled || M.parentBusy) return;
        M.applyParentChange(null, parent.id);
      });

      chip.appendChild(openBtn);
      chip.appendChild(clearBtn);
      return chip;
    };
    M.renderParent = function renderParent() {
      var canPick = !!M.getBoardCards && !!M.onParentChange;
      M.parentChipsEl.replaceChildren();
      M.parentCards.forEach(function (parent) {
        M.parentChipsEl.appendChild(M.buildParentChip(parent));
      });
      M.parentPickBtn.hidden = !canPick;
      M.parentPickBtn.disabled = M.parentBusy;
      if (!canPick && !M.parentCards.length) {
        M.setParentStatus('', false);
      }
    };
    },
    run: function (M) {

    }
  });
})(typeof window !== 'undefined' ? window : this);
