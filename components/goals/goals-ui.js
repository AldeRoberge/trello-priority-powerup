/* Goals UI — board settings manager (Objectifs → Projets).
 * Exposes window.GoalsUI (no bundler). Depends on GoalsTrello + PriorityUI chrome.
 */
(function (global) {
  'use strict';

  function el(tag, className, props) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (props) {
      Object.keys(props).forEach(function (key) {
        if (key === 'text') node.textContent = props[key];
        else if (key === 'html') node.innerHTML = props[key];
        else if (key === 'attrs') {
          Object.keys(props.attrs).forEach(function (a) {
            node.setAttribute(a, props.attrs[a]);
          });
        } else {
          node[key] = props[key];
        }
      });
    }
    return node;
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function spellcheckText(text) {
    var trimmed = String(text || '').trim();
    if (
      !trimmed ||
      typeof global.Spellcheck === 'undefined' ||
      typeof global.Spellcheck.correct !== 'function'
    ) {
      return Promise.resolve(trimmed);
    }
    return global.Spellcheck.correct(trimmed).then(
      function (corrected) {
        return typeof corrected === 'string' && corrected.trim() ? corrected.trim() : trimmed;
      },
      function () {
        return trimmed;
      }
    );
  }

  /**
   * Mount cascading Goals manager into a settings container.
   */
  function mountGoalsSettings(containerEl, options) {
    options = options || {};
    var t = options.t;
    var GT = global.GoalsTrello;
    var Agent = global.PriorityAgent;
    var onResize = typeof options.onResize === 'function' ? options.onResize : function () {};
    var initialSelection = options.initialSelection || null;

    if (!containerEl || !t || !GT) {
      console.error('GoalsUI.mountGoalsSettings: missing deps');
      return null;
    }

    var state = {
      objectifs: [],
      projects: [],
      selectedObjectifId: null,
      selectedProjectId: null,
      boardName: '',
      aiEnabled: false,
    };

    var suggestCache = {
      objectif: { names: [], loading: false, seq: 0, key: '' },
      project: { names: [], loading: false, seq: 0, key: '' },
    };

    containerEl.replaceChildren();
    containerEl.classList.add('tp-goals-settings');

    var stack = el('div', 'tp-goals-stack');

    var objectifPanel = buildLevelPanel({
      kind: 'objectif',
      title: 'Objectifs',
      icon: 'ti-target',
      placeholder: 'Nouvel objectif\u2026',
      emptyHint: 'Aucun objectif pour l\u2019instant.',
    });
    var projectPanel = buildLevelPanel({
      kind: 'project',
      title: 'Projets',
      icon: 'ti-folder',
      placeholder: 'Nouveau projet\u2026',
      emptyHint: 'Choisissez un objectif.',
    });

    stack.appendChild(objectifPanel.root);
    stack.appendChild(projectPanel.root);
    containerEl.appendChild(stack);

    objectifPanel.root.open = true;

    function buildLevelPanel(cfg) {
      var root = el('details', 'tp-goals-panel');
      root.dataset.kind = cfg.kind;

      var summary = el('summary', 'tp-goals-panel-summary');
      summary.appendChild(
        el('span', 'tp-goals-panel-icon', {
          html: '<i class="ti ' + cfg.icon + '" aria-hidden="true"></i>',
        })
      );
      summary.appendChild(el('span', 'tp-goals-panel-title', { text: cfg.title }));
      var selectedLabel = el('span', 'tp-goals-panel-selected');
      selectedLabel.hidden = true;
      summary.appendChild(selectedLabel);
      var countBadge = el('span', 'tp-goals-panel-count', { text: '0' });
      summary.appendChild(countBadge);
      root.appendChild(summary);

      var body = el('div', 'tp-goals-panel-body');
      var listEl = el('div', 'tp-goals-list');
      body.appendChild(listEl);

      var addRow = buildAddRow(cfg.placeholder, function (name) {
        return createForKind(cfg.kind, name);
      });
      body.appendChild(addRow);

      var suggestSection = el('div', 'tp-goals-suggestions');
      suggestSection.hidden = true;
      suggestSection.innerHTML =
        '<div class="tp-goals-suggestions-head">' +
        '<button type="button" class="tp-goals-suggestions-refresh" ' +
        'aria-label="Rafra\u00eechir les suggestions" title="Rafra\u00eechir">\u21bb</button>' +
        '</div>' +
        '<p class="tp-goals-suggestions-status" hidden></p>' +
        '<div class="tp-goals-suggestions-list" role="list"></div>';
      body.appendChild(suggestSection);
      root.appendChild(body);

      var refreshBtn = suggestSection.querySelector('.tp-goals-suggestions-refresh');
      refreshBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        refreshSuggestions(cfg.kind, true);
      });

      return {
        kind: cfg.kind,
        title: cfg.title,
        emptyHint: cfg.emptyHint,
        root: root,
        listEl: listEl,
        addRow: addRow,
        selectedLabel: selectedLabel,
        countBadge: countBadge,
        suggestSection: suggestSection,
        suggestStatus: suggestSection.querySelector('.tp-goals-suggestions-status'),
        suggestList: suggestSection.querySelector('.tp-goals-suggestions-list'),
      };
    }

    function createForKind(kind, name) {
      if (kind === 'objectif') {
        return GT.createObjectif(t, name).then(function (o) {
          state.selectedObjectifId = o.id;
          state.selectedProjectId = null;
          projectPanel.root.open = true;
          return reload();
        });
      }
      if (!state.selectedObjectifId) {
        window.alert('S\u00e9lectionnez un objectif d\u2019abord.');
        return Promise.resolve();
      }
      var objectif = GT.findById(state.objectifs, state.selectedObjectifId);
      if (objectif && objectif.retired) {
        window.alert('Impossible d\u2019ajouter sous un objectif retir\u00e9.');
        return Promise.resolve();
      }
      return GT.createProject(t, name, state.selectedObjectifId).then(function (p) {
        state.selectedProjectId = p.id;
        return reload();
      });
    }

    function buildAddRow(placeholder, onCreate) {
      var row = el('form', 'tp-goals-add-row');
      row.setAttribute('novalidate', '');
      var input = el('input', 'tp-goals-input', {
        type: 'text',
        attrs: { placeholder: placeholder, maxlength: '120', autocomplete: 'off' },
      });
      var btn = el('button', 'tp-button tp-button--secondary tp-goals-add-btn', {
        type: 'submit',
        text: 'Ajouter',
      });

      function submitCreate(e) {
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }
        var raw = input.value.trim();
        if (!raw || btn.disabled) return;
        btn.disabled = true;
        spellcheckText(raw)
          .then(function (name) {
            return onCreate(name);
          })
          .then(function () {
            input.value = '';
            input.focus();
          })
          .catch(function (err) {
            console.error('Goals create failed', err);
            window.alert((err && err.message) || 'Cr\u00e9ation impossible');
          })
          .then(function () {
            btn.disabled = false;
            onResize();
          });
      }

      row.addEventListener('submit', submitCreate);
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.keyCode === 13) {
          e.preventDefault();
          e.stopPropagation();
          submitCreate(e);
        }
      });
      row.appendChild(input);
      row.appendChild(btn);
      return row;
    }

    function entityRow(item, selectedId, onSelect, onRename, onRetire) {
      var row = el(
        'div',
        'tp-goals-item' +
          (item.id === selectedId ? ' is-selected' : '') +
          (item.retired ? ' is-retired' : '')
      );
      row.setAttribute('role', 'button');
      row.tabIndex = 0;

      var nameEl = el('span', 'tp-goals-item-name', { text: item.name });
      row.appendChild(nameEl);
      if (item.retired) {
        row.appendChild(el('span', 'tp-goals-retired-tag', { text: 'Retir\u00e9' }));
      }

      var actions = el('div', 'tp-goals-item-actions');
      var editBtn = el('button', 'tp-goals-icon-btn', {
        type: 'button',
        attrs: { 'aria-label': 'Modifier', title: 'Modifier' },
        html: '<i class="ti ti-pencil" aria-hidden="true"></i>',
      });
      editBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        var next = window.prompt('Nouveau nom', item.name);
        if (next == null) return;
        var trimmed = next.trim();
        if (!trimmed || trimmed === item.name) return;
        spellcheckText(trimmed)
          .then(function (name) {
            return onRename(name);
          })
          .catch(function (err) {
            console.error('Goals rename failed', err);
          });
      });
      actions.appendChild(editBtn);

      if (!item.retired) {
        var retireBtn = el('button', 'tp-goals-icon-btn', {
          type: 'button',
          attrs: { 'aria-label': 'Retirer', title: 'Retirer' },
          html: '<i class="ti ti-archive" aria-hidden="true"></i>',
        });
        retireBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          if (
            !window.confirm(
              'Retirer \u00ab ' + item.name + ' \u00bb ? Il dispara\u00eetra des s\u00e9lecteurs.'
            )
          ) {
            return;
          }
          onRetire().catch(function (err) {
            console.error('Goals retire failed', err);
          });
        });
        actions.appendChild(retireBtn);
      }
      row.appendChild(actions);

      row.addEventListener('click', function () {
        onSelect();
      });
      row.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      });
      return row;
    }

    function setPanelSelected(panel, item) {
      if (item && item.name) {
        panel.selectedLabel.hidden = false;
        panel.selectedLabel.textContent = item.name;
      } else {
        panel.selectedLabel.hidden = true;
        panel.selectedLabel.textContent = '';
      }
    }

    function setPanelEnabled(panel, enabled) {
      panel.root.classList.toggle('is-disabled', !enabled);
      panel.addRow.hidden = !enabled;
      var inputs = panel.addRow.querySelectorAll('input, button');
      for (var i = 0; i < inputs.length; i++) {
        inputs[i].disabled = !enabled;
      }
    }

    function hierarchyDigest() {
      return {
        objectifs: state.objectifs
          .filter(function (o) {
            return !o.retired;
          })
          .map(function (o) {
            return o.name;
          })
          .slice(0, 20),
        projects: state.projects
          .filter(function (p) {
            return !p.retired && p.objectifId === state.selectedObjectifId;
          })
          .map(function (p) {
            return p.name;
          })
          .slice(0, 20),
      };
    }

    function suggestionContext(kind) {
      var existing = [];
      var parentObjectif = '';
      if (kind === 'objectif') {
        existing = state.objectifs.map(function (o) {
          return o.name;
        });
      } else {
        var objectif = GT.findById(state.objectifs, state.selectedObjectifId);
        parentObjectif = objectif ? objectif.name : '';
        existing = state.projects
          .filter(function (p) {
            return p.objectifId === state.selectedObjectifId;
          })
          .map(function (p) {
            return p.name;
          });
      }
      return {
        kind: kind,
        boardName: state.boardName,
        parentObjectif: parentObjectif,
        existingNames: existing,
        hierarchy: hierarchyDigest(),
      };
    }

    function canSuggest(kind) {
      if (!state.aiEnabled) return false;
      if (kind === 'project') return !!state.selectedObjectifId;
      return true;
    }

    function panelForKind(kind) {
      if (kind === 'project') return projectPanel;
      return objectifPanel;
    }

    function setSuggestStatus(panel, text, show) {
      if (!panel.suggestStatus) return;
      if (!show || !text) {
        panel.suggestStatus.hidden = true;
        panel.suggestStatus.textContent = '';
        return;
      }
      panel.suggestStatus.hidden = false;
      panel.suggestStatus.textContent = text;
    }

    function renderSuggestions(kind) {
      var panel = panelForKind(kind);
      var cache = suggestCache[kind];
      panel.suggestList.replaceChildren();

      if (!canSuggest(kind)) {
        panel.suggestSection.hidden = true;
        return;
      }
      panel.suggestSection.hidden = false;

      if (cache.loading) {
        setSuggestStatus(panel, 'G\u00e9n\u00e9ration des suggestions\u2026', true);
        return;
      }
      if (!cache.names.length) {
        setSuggestStatus(panel, 'Aucune suggestion pour le moment.', true);
        return;
      }
      setSuggestStatus(panel, '', false);
      cache.names.forEach(function (label) {
        var btn = el('button', 'tp-goals-suggestion', {
          type: 'button',
          text: label,
          attrs: { 'data-suggestion': label, role: 'listitem', title: 'Ajouter\u00a0: ' + label },
        });
        btn.addEventListener('click', function () {
          btn.disabled = true;
          spellcheckText(label)
            .then(function (name) {
              return createForKind(kind, name || label);
            })
            .then(function () {
              cache.names = cache.names.filter(function (s) {
                return s !== label;
              });
              renderSuggestions(kind);
            })
            .catch(function (err) {
              console.error('Goals suggest create failed', err);
              btn.disabled = false;
            });
        });
        panel.suggestList.appendChild(btn);
      });
    }

    function refreshSuggestions(kind, force) {
      if (!canSuggest(kind) || !Agent || typeof Agent.suggestGoals !== 'function') {
        panelForKind(kind).suggestSection.hidden = true;
        return Promise.resolve();
      }
      var ctx = suggestionContext(kind);
      var key = kind + '|' + (ctx.parentObjectif || '') + '|' + ctx.existingNames.join('\u0001');
      var cache = suggestCache[kind];
      if (!force && cache.key === key && (cache.names.length || cache.loading)) {
        renderSuggestions(kind);
        return Promise.resolve();
      }

      var seq = ++cache.seq;
      cache.loading = true;
      cache.key = key;
      renderSuggestions(kind);

      return Agent.getProvider(t)
        .then(function (provider) {
          if (!Agent.isConfigured(provider)) {
            state.aiEnabled = false;
            return [];
          }
          return Agent.suggestGoals(provider, ctx);
        })
        .then(function (list) {
          if (seq !== cache.seq) return;
          cache.names = Array.isArray(list)
            ? list
                .map(function (s) {
                  return String(s || '').trim();
                })
                .filter(Boolean)
                .slice(0, 3)
            : [];
          cache.loading = false;
          renderSuggestions(kind);
          onResize();
        })
        .catch(function (err) {
          console.error('Goals suggestions failed', err);
          if (seq !== cache.seq) return;
          cache.loading = false;
          cache.names = [];
          setSuggestStatus(
            panelForKind(kind),
            'Impossible de g\u00e9n\u00e9rer des suggestions (IA indisponible).',
            true
          );
          panelForKind(kind).suggestSection.hidden = false;
          onResize();
        });
    }

    function renderLists() {
      objectifPanel.listEl.replaceChildren();
      projectPanel.listEl.replaceChildren();

      state.objectifs.forEach(function (o) {
        objectifPanel.listEl.appendChild(
          entityRow(
            o,
            state.selectedObjectifId,
            function () {
              state.selectedObjectifId = o.id;
              state.selectedProjectId = null;
              projectPanel.root.open = true;
              renderLists();
              refreshSuggestions('project', false);
              onResize();
            },
            function (name) {
              return GT.updateObjectif(t, o.id, { name: name }).then(reload);
            },
            function () {
              return GT.retireObjectif(t, o.id).then(reload);
            }
          )
        );
      });
      if (!state.objectifs.length) {
        objectifPanel.listEl.appendChild(
          el('p', 'tp-goals-empty', { text: objectifPanel.emptyHint })
        );
      }
      objectifPanel.countBadge.textContent = String(state.objectifs.length);
      setPanelSelected(objectifPanel, GT.findById(state.objectifs, state.selectedObjectifId));
      setPanelEnabled(objectifPanel, true);

      var projects = state.projects.filter(function (p) {
        return p.objectifId === state.selectedObjectifId;
      });
      var projectReady = !!state.selectedObjectifId;
      setPanelEnabled(projectPanel, projectReady);
      if (!projectReady) {
        projectPanel.listEl.appendChild(
          el('p', 'tp-goals-empty', { text: 'Choisissez un objectif.' })
        );
      } else if (!projects.length) {
        projectPanel.listEl.appendChild(el('p', 'tp-goals-empty', { text: 'Aucun projet.' }));
      } else {
        projects.forEach(function (p) {
          projectPanel.listEl.appendChild(
            entityRow(
              p,
              state.selectedProjectId,
              function () {
                state.selectedProjectId = p.id;
                renderLists();
                onResize();
              },
              function (name) {
                return GT.updateProject(t, p.id, { name: name }).then(reload);
              },
              function () {
                return GT.retireProject(t, p.id).then(reload);
              }
            )
          );
        });
      }
      projectPanel.countBadge.textContent = projectReady ? String(projects.length) : '\u2014';
      setPanelSelected(
        projectPanel,
        projectReady ? GT.findById(state.projects, state.selectedProjectId) : null
      );

      renderSuggestions('objectif');
      renderSuggestions('project');
    }

    function detectAi() {
      if (
        !Agent ||
        typeof Agent.getProvider !== 'function' ||
        typeof Agent.isConfigured !== 'function'
      ) {
        state.aiEnabled = false;
        return Promise.resolve(false);
      }
      return Agent.getProvider(t)
        .then(function (provider) {
          state.aiEnabled = Agent.isConfigured(provider);
          return state.aiEnabled;
        })
        .catch(function () {
          state.aiEnabled = false;
          return false;
        });
    }

    function loadBoardName() {
      if (!t || typeof t.board !== 'function') return Promise.resolve('');
      return Promise.resolve()
        .then(function () {
          return t.board('name');
        })
        .then(function (board) {
          state.boardName =
            board && typeof board.name === 'string'
              ? board.name
              : typeof board === 'string'
                ? board
                : '';
          return state.boardName;
        })
        .catch(function () {
          state.boardName = '';
          return '';
        });
    }

    function applyInitialSelection(sel) {
      if (!sel) return;
      var objectifId = sel.objectifId || null;
      var projectId = sel.projectId || null;

      if (projectId) {
        var project = GT.findById(state.projects, projectId);
        if (project) {
          projectId = project.id;
          objectifId = objectifId || project.objectifId || null;
        } else {
          projectId = null;
        }
      }
      if (objectifId && !GT.findById(state.objectifs, objectifId)) {
        objectifId = null;
        projectId = null;
      }

      state.selectedObjectifId = objectifId;
      state.selectedProjectId = projectId;

      objectifPanel.root.open = true;
      if (projectId || objectifId) projectPanel.root.open = true;

      renderLists();
      onResize();
    }

    function reload() {
      return Promise.all([
        GT.getObjectifs(t),
        GT.getProjects(t),
        detectAi(),
        loadBoardName(),
      ]).then(function (results) {
        state.objectifs = results[0];
        state.projects = results[1];
        if (state.selectedObjectifId && !GT.findById(state.objectifs, state.selectedObjectifId)) {
          state.selectedObjectifId = null;
          state.selectedProjectId = null;
        }
        if (state.selectedProjectId && !GT.findById(state.projects, state.selectedProjectId)) {
          state.selectedProjectId = null;
        }
        renderLists();
        onResize();
        setTimeout(function () {
          refreshSuggestions('objectif', false);
          if (state.selectedObjectifId) refreshSuggestions('project', false);
        }, 0);
      });
    }

    return reload().then(function () {
      if (initialSelection) {
        applyInitialSelection(initialSelection);
        initialSelection = null;
        setTimeout(function () {
          refreshSuggestions('objectif', false);
          if (state.selectedObjectifId) refreshSuggestions('project', false);
        }, 0);
      }
      return {
        reload: reload,
        getState: function () {
          return state;
        },
      };
    });
  }

  global.GoalsUI = {
    mountGoalsSettings: mountGoalsSettings,
    spellcheckText: spellcheckText,
    escapeHtml: escapeHtml,
  };
})(typeof window !== 'undefined' ? window : globalThis);
