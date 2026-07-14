/* Goals UI — board settings manager + card Objectif section helpers.
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

  function directionLabel(dir) {
    if (dir === 'decrease') return 'Diminuer \u2193';
    if (dir === 'hold') return 'Maintenir \u2194';
    return 'Augmenter \u2191';
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

    if (!containerEl || !t || !GT) {
      console.error('GoalsUI.mountGoalsSettings: missing deps');
      return null;
    }

    var state = {
      visions: [],
      missions: [],
      projects: [],
      metrics: [],
      selectedVisionId: null,
      selectedMissionId: null,
      selectedProjectId: null,
      boardName: '',
      aiEnabled: false,
    };

    var suggestCache = {
      vision: { names: [], loading: false, seq: 0, key: '' },
      mission: { names: [], loading: false, seq: 0, key: '' },
      project: { names: [], loading: false, seq: 0, key: '' },
    };

    containerEl.replaceChildren();
    containerEl.classList.add('tp-goals-settings');

    var stack = el('div', 'tp-goals-stack');
    var metricsPanel = el('div', 'tp-goals-metrics');

    var visionPanel = buildLevelPanel({
      kind: 'vision',
      title: 'Vision',
      icon: 'ti-eye',
      placeholder: 'Nouvelle vision\u2026',
      emptyHint: 'Aucune vision pour l\u2019instant.',
    });
    var missionPanel = buildLevelPanel({
      kind: 'mission',
      title: 'Mission',
      icon: 'ti-flag',
      placeholder: 'Nouvelle mission\u2026',
      emptyHint: 'Choisissez une vision.',
    });
    var projectPanel = buildLevelPanel({
      kind: 'project',
      title: 'Projet',
      icon: 'ti-folder',
      placeholder: 'Nouveau projet\u2026',
      emptyHint: 'Choisissez une mission.',
    });

    stack.appendChild(visionPanel.root);
    stack.appendChild(missionPanel.root);
    stack.appendChild(projectPanel.root);
    containerEl.appendChild(stack);
    containerEl.appendChild(metricsPanel);

    visionPanel.root.open = true;

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
        '<span class="tp-goals-suggestions-label">Suggestions IA</span>' +
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
      if (kind === 'vision') {
        return GT.createVision(t, name).then(function (v) {
          state.selectedVisionId = v.id;
          state.selectedMissionId = null;
          state.selectedProjectId = null;
          missionPanel.root.open = true;
          return reload();
        });
      }
      if (kind === 'mission') {
        if (!state.selectedVisionId) {
          window.alert('S\u00e9lectionnez une vision d\u2019abord.');
          return Promise.resolve();
        }
        var vision = GT.findById(state.visions, state.selectedVisionId);
        if (vision && vision.retired) {
          window.alert('Impossible d\u2019ajouter sous une vision retir\u00e9e.');
          return Promise.resolve();
        }
        return GT.createMission(t, name, state.selectedVisionId).then(function (m) {
          state.selectedMissionId = m.id;
          state.selectedProjectId = null;
          projectPanel.root.open = true;
          return reload();
        });
      }
      if (!state.selectedMissionId) {
        window.alert('S\u00e9lectionnez une mission d\u2019abord.');
        return Promise.resolve();
      }
      var mission = GT.findById(state.missions, state.selectedMissionId);
      if (mission && mission.retired) {
        window.alert('Impossible d\u2019ajouter sous une mission retir\u00e9e.');
        return Promise.resolve();
      }
      return GT.createProject(t, name, state.selectedMissionId).then(function (p) {
        state.selectedProjectId = p.id;
        return reload();
      });
    }

    function buildAddRow(placeholder, onCreate) {
      var row = el('div', 'tp-goals-add-row');
      var input = el('input', 'tp-goals-input', {
        type: 'text',
        attrs: { placeholder: placeholder, maxlength: '120' },
      });
      var btn = el('button', 'tp-button tp-button--secondary tp-goals-add-btn', {
        type: 'button',
        text: 'Ajouter',
      });
      btn.addEventListener('click', function () {
        var raw = input.value.trim();
        if (!raw) return;
        btn.disabled = true;
        spellcheckText(raw)
          .then(function (name) {
            return onCreate(name);
          })
          .then(function () {
            input.value = '';
          })
          .catch(function (err) {
            console.error('Goals create failed', err);
            window.alert((err && err.message) || 'Cr\u00e9ation impossible');
          })
          .then(function () {
            btn.disabled = false;
            onResize();
          });
      });
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          btn.click();
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
        visions: state.visions
          .filter(function (v) {
            return !v.retired;
          })
          .map(function (v) {
            return v.name;
          })
          .slice(0, 20),
        missions: state.missions
          .filter(function (m) {
            return !m.retired && m.visionId === state.selectedVisionId;
          })
          .map(function (m) {
            return m.name;
          })
          .slice(0, 20),
        projects: state.projects
          .filter(function (p) {
            return !p.retired && p.missionId === state.selectedMissionId;
          })
          .map(function (p) {
            return p.name;
          })
          .slice(0, 20),
      };
    }

    function suggestionContext(kind) {
      var existing = [];
      var parentVision = '';
      var parentMission = '';
      if (kind === 'vision') {
        existing = state.visions.map(function (v) {
          return v.name;
        });
      } else if (kind === 'mission') {
        var vision = GT.findById(state.visions, state.selectedVisionId);
        parentVision = vision ? vision.name : '';
        existing = state.missions
          .filter(function (m) {
            return m.visionId === state.selectedVisionId;
          })
          .map(function (m) {
            return m.name;
          });
      } else {
        var mission = GT.findById(state.missions, state.selectedMissionId);
        parentMission = mission ? mission.name : '';
        var parentV = mission ? GT.findById(state.visions, mission.visionId) : null;
        parentVision = parentV ? parentV.name : '';
        existing = state.projects
          .filter(function (p) {
            return p.missionId === state.selectedMissionId;
          })
          .map(function (p) {
            return p.name;
          });
      }
      return {
        kind: kind,
        boardName: state.boardName,
        parentVision: parentVision,
        parentMission: parentMission,
        existingNames: existing,
        hierarchy: hierarchyDigest(),
      };
    }

    function canSuggest(kind) {
      if (!state.aiEnabled) return false;
      if (kind === 'mission') return !!state.selectedVisionId;
      if (kind === 'project') return !!state.selectedMissionId;
      return true;
    }

    function panelForKind(kind) {
      if (kind === 'mission') return missionPanel;
      if (kind === 'project') return projectPanel;
      return visionPanel;
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
      var key =
        kind +
        '|' +
        (ctx.parentVision || '') +
        '|' +
        (ctx.parentMission || '') +
        '|' +
        ctx.existingNames.join('\u0001');
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
      visionPanel.listEl.replaceChildren();
      missionPanel.listEl.replaceChildren();
      projectPanel.listEl.replaceChildren();

      state.visions.forEach(function (v) {
        visionPanel.listEl.appendChild(
          entityRow(
            v,
            state.selectedVisionId,
            function () {
              state.selectedVisionId = v.id;
              state.selectedMissionId = null;
              state.selectedProjectId = null;
              missionPanel.root.open = true;
              renderLists();
              renderMetrics();
              refreshSuggestions('mission', false);
              refreshSuggestions('project', false);
              onResize();
            },
            function (name) {
              return GT.updateVision(t, v.id, { name: name }).then(reload);
            },
            function () {
              return GT.retireVision(t, v.id).then(reload);
            }
          )
        );
      });
      if (!state.visions.length) {
        visionPanel.listEl.appendChild(el('p', 'tp-goals-empty', { text: visionPanel.emptyHint }));
      }
      visionPanel.countBadge.textContent = String(state.visions.length);
      setPanelSelected(visionPanel, GT.findById(state.visions, state.selectedVisionId));
      setPanelEnabled(visionPanel, true);

      var missions = state.missions.filter(function (m) {
        return m.visionId === state.selectedVisionId;
      });
      var missionReady = !!state.selectedVisionId;
      setPanelEnabled(missionPanel, missionReady);
      if (!missionReady) {
        missionPanel.listEl.appendChild(
          el('p', 'tp-goals-empty', { text: 'Choisissez une vision.' })
        );
      } else if (!missions.length) {
        missionPanel.listEl.appendChild(el('p', 'tp-goals-empty', { text: 'Aucune mission.' }));
      } else {
        missions.forEach(function (m) {
          missionPanel.listEl.appendChild(
            entityRow(
              m,
              state.selectedMissionId,
              function () {
                state.selectedMissionId = m.id;
                state.selectedProjectId = null;
                projectPanel.root.open = true;
                renderLists();
                renderMetrics();
                refreshSuggestions('project', false);
                onResize();
              },
              function (name) {
                return GT.updateMission(t, m.id, { name: name }).then(reload);
              },
              function () {
                return GT.retireMission(t, m.id).then(reload);
              }
            )
          );
        });
      }
      missionPanel.countBadge.textContent = missionReady ? String(missions.length) : '\u2014';
      setPanelSelected(
        missionPanel,
        missionReady ? GT.findById(state.missions, state.selectedMissionId) : null
      );

      var projects = state.projects.filter(function (p) {
        return p.missionId === state.selectedMissionId;
      });
      var projectReady = !!state.selectedMissionId;
      setPanelEnabled(projectPanel, projectReady);
      if (!projectReady) {
        projectPanel.listEl.appendChild(
          el('p', 'tp-goals-empty', { text: 'Choisissez une mission.' })
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

      renderSuggestions('vision');
      renderSuggestions('mission');
      renderSuggestions('project');
    }

    function renderMetrics() {
      metricsPanel.replaceChildren();
      if (!state.selectedMissionId) {
        metricsPanel.appendChild(
          el('p', 'tp-goals-empty', {
            text: 'Sélectionnez une mission pour gérer ses métriques.',
          })
        );
        return;
      }

      var mission = GT.findById(state.missions, state.selectedMissionId);
      metricsPanel.appendChild(
        el('h4', 'tp-goals-col-title', {
          text: 'Métriques — ' + (mission ? mission.name : ''),
        })
      );

      var metrics = state.metrics.filter(function (m) {
        return m.linkedGoalId === state.selectedMissionId;
      });

      var listEl = el('div', 'tp-goals-metrics-list');
      if (!metrics.length) {
        listEl.appendChild(el('p', 'tp-goals-empty', { text: 'Aucune métrique.' }));
      } else {
        metrics.forEach(function (metric) {
          listEl.appendChild(renderMetricCard(metric, metrics));
        });
      }
      metricsPanel.appendChild(listEl);
      metricsPanel.appendChild(renderMetricForm(null, metrics));
    }

    function renderMetricCard(metric, allMetrics) {
      var card = el('div', 'tp-goals-metric-card' + (metric.isPrimary ? ' is-primary' : ''));
      var head = el('div', 'tp-goals-metric-head');
      head.appendChild(el('strong', 'tp-goals-metric-name', { text: metric.name }));
      if (metric.isPrimary) {
        head.appendChild(el('span', 'tp-goals-primary-tag', { text: 'Principale' }));
      }
      head.appendChild(
        el('span', 'tp-goals-metric-meta', {
          text: directionLabel(metric.direction) + ' · ' + metric.type,
        })
      );
      card.appendChild(head);

      card.appendChild(
        el('p', 'tp-goals-metric-value', {
          text: GT.formatMetricValue(metric),
        })
      );

      var actions = el('div', 'tp-goals-metric-actions');
      if (!metric.isPrimary) {
        var primaryBtn = el('button', 'tp-button tp-button--secondary', {
          type: 'button',
          text: 'Principale',
        });
        primaryBtn.addEventListener('click', function () {
          GT.setPrimaryMetric(t, state.selectedMissionId, metric.id)
            .then(reload)
            .catch(function (err) {
              console.error('setPrimaryMetric failed', err);
            });
        });
        actions.appendChild(primaryBtn);
      }

      var editBtn = el('button', 'tp-button tp-button--secondary', {
        type: 'button',
        text: 'Modifier',
      });
      editBtn.addEventListener('click', function () {
        var formHost = card.querySelector('.tp-goals-metric-edit');
        if (formHost) {
          formHost.remove();
          return;
        }
        var host = el('div', 'tp-goals-metric-edit');
        host.appendChild(renderMetricForm(metric, allMetrics));
        card.appendChild(host);
        onResize();
      });
      actions.appendChild(editBtn);

      var delBtn = el('button', 'tp-button tp-button--secondary', {
        type: 'button',
        text: 'Supprimer',
      });
      delBtn.addEventListener('click', function () {
        if (!window.confirm('Supprimer la métrique « ' + metric.name + ' » ?')) return;
        GT.removeMetric(t, metric.id)
          .then(reload)
          .catch(function (err) {
            console.error('removeMetric failed', err);
          });
      });
      actions.appendChild(delBtn);
      card.appendChild(actions);
      return card;
    }

    function renderMetricForm(existing, allMetrics) {
      var isEdit = !!existing;
      var form = el('div', 'tp-goals-metric-form');
      form.appendChild(
        el('h5', 'tp-goals-form-title', {
          text: isEdit ? 'Modifier la métrique' : 'Ajouter une métrique',
        })
      );

      function field(label, control) {
        var wrap = el('label', 'tp-goals-field');
        wrap.appendChild(el('span', 'tp-goals-field-label', { text: label }));
        wrap.appendChild(control);
        return wrap;
      }

      var nameInput = el('input', 'tp-goals-input', {
        type: 'text',
        value: existing ? existing.name : '',
        attrs: { maxlength: '120', placeholder: 'Nom' },
      });
      var typeSelect = el('select', 'tp-select');
      [
        ['incremental', 'Incrémentale'],
        ['sentimental', 'Sentimentale'],
      ].forEach(function (opt) {
        var o = el('option', null, { value: opt[0], text: opt[1] });
        if ((existing && existing.type === opt[0]) || (!existing && opt[0] === 'incremental')) {
          o.selected = true;
        }
        typeSelect.appendChild(o);
      });

      var dirSelect = el('select', 'tp-select');
      [
        ['increase', 'Augmenter ↑'],
        ['decrease', 'Diminuer ↓'],
        ['hold', 'Maintenir ↔'],
      ].forEach(function (opt) {
        var o = el('option', null, { value: opt[0], text: opt[1] });
        if ((existing && existing.direction === opt[0]) || (!existing && opt[0] === 'increase')) {
          o.selected = true;
        }
        dirSelect.appendChild(o);
      });

      var measureSelect = el('select', 'tp-select');
      [
        ['manual', 'Manuelle'],
        ['direct', 'Directe'],
      ].forEach(function (opt) {
        var o = el('option', null, { value: opt[0], text: opt[1] });
        if ((existing && existing.measurement === opt[0]) || (!existing && opt[0] === 'manual')) {
          o.selected = true;
        }
        measureSelect.appendChild(o);
      });

      var currentInput = el('input', 'tp-goals-input', {
        type: 'number',
        value: existing ? String(existing.currentValue) : '0',
        step: 'any',
      });
      var targetInput = el('input', 'tp-goals-input', {
        type: 'number',
        value: existing && existing.target != null ? String(existing.target) : '',
        step: 'any',
        attrs: { placeholder: 'Optionnel' },
      });
      var scaleLo = el('input', 'tp-goals-input', {
        type: 'text',
        value: existing && existing.scaleLabels ? existing.scaleLabels[0] : '',
        attrs: { placeholder: 'Ex. Très ennuyant' },
      });
      var scaleHi = el('input', 'tp-goals-input', {
        type: 'text',
        value: existing && existing.scaleLabels ? existing.scaleLabels[1] : '',
        attrs: { placeholder: 'Ex. Très valorisant' },
      });
      var primaryCheck = el('input', null, {
        type: 'checkbox',
        checked: existing ? !!existing.isPrimary : false,
      });
      var primaryLabel = el('label', 'tp-goals-toggle');
      primaryLabel.appendChild(primaryCheck);
      primaryLabel.appendChild(document.createTextNode(' Métrique principale'));

      var depsSelect = el('select', 'tp-select tp-goals-deps-select', {
        multiple: true,
      });
      (allMetrics || [])
        .filter(function (m) {
          return !existing || m.id !== existing.id;
        })
        .forEach(function (m) {
          var o = el('option', null, { value: m.id, text: m.name });
          if (existing && existing.dependsOn && existing.dependsOn.indexOf(m.id) !== -1) {
            o.selected = true;
          }
          depsSelect.appendChild(o);
        });

      form.appendChild(field('Nom', nameInput));
      form.appendChild(field('Type', typeSelect));
      form.appendChild(field('Direction', dirSelect));
      form.appendChild(field('Mesure', measureSelect));
      form.appendChild(field('Valeur actuelle', currentInput));
      form.appendChild(field('Cible', targetInput));
      form.appendChild(field('Échelle (bas)', scaleLo));
      form.appendChild(field('Échelle (haut)', scaleHi));
      form.appendChild(field('Dépend de', depsSelect));
      form.appendChild(primaryLabel);

      var saveBtn = el('button', 'tp-button', {
        type: 'button',
        text: isEdit ? 'Enregistrer' : 'Ajouter',
      });
      saveBtn.addEventListener('click', function () {
        var rawName = nameInput.value.trim();
        if (!rawName) {
          window.alert('Nom requis');
          return;
        }
        saveBtn.disabled = true;
        spellcheckText(rawName)
          .then(function (name) {
            var selectedDeps = [];
            for (var i = 0; i < depsSelect.options.length; i++) {
              if (depsSelect.options[i].selected) selectedDeps.push(depsSelect.options[i].value);
            }
            var payload = {
              name: name,
              type: typeSelect.value,
              direction: dirSelect.value,
              measurement: measureSelect.value,
              currentValue: Number(currentInput.value),
              linkedGoalId: state.selectedMissionId,
              isPrimary: !!primaryCheck.checked,
            };
            if (targetInput.value !== '') {
              payload.target = Number(targetInput.value);
            }
            if (payload.type === 'sentimental' && scaleLo.value.trim() && scaleHi.value.trim()) {
              payload.scaleLabels = [scaleLo.value.trim(), scaleHi.value.trim()];
            }
            if (selectedDeps.length) payload.dependsOn = selectedDeps;

            if (isEdit) {
              return GT.updateMetric(t, existing.id, payload).then(function () {
                if (payload.isPrimary) {
                  return GT.setPrimaryMetric(t, state.selectedMissionId, existing.id);
                }
                if (existing.isPrimary && !payload.isPrimary) {
                  return GT.setPrimaryMetric(t, state.selectedMissionId, null);
                }
              });
            }
            return GT.createMetric(t, payload);
          })
          .then(reload)
          .catch(function (err) {
            console.error('Metric save failed', err);
            window.alert((err && err.message) || 'Enregistrement impossible');
          })
          .then(function () {
            saveBtn.disabled = false;
          });
      });
      form.appendChild(saveBtn);
      return form;
    }

    function detectAi() {
      if (!Agent || typeof Agent.getProvider !== 'function' || typeof Agent.isConfigured !== 'function') {
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

    function reload() {
      return Promise.all([
        GT.getVisions(t),
        GT.getMissions(t),
        GT.getProjects(t),
        GT.getMetrics(t),
        detectAi(),
        loadBoardName(),
      ]).then(function (results) {
        state.visions = results[0];
        state.missions = results[1];
        state.projects = results[2];
        state.metrics = results[3];
        if (state.selectedVisionId && !GT.findById(state.visions, state.selectedVisionId)) {
          state.selectedVisionId = null;
          state.selectedMissionId = null;
          state.selectedProjectId = null;
        }
        if (state.selectedMissionId && !GT.findById(state.missions, state.selectedMissionId)) {
          state.selectedMissionId = null;
          state.selectedProjectId = null;
        }
        if (state.selectedProjectId && !GT.findById(state.projects, state.selectedProjectId)) {
          state.selectedProjectId = null;
        }
        renderLists();
        renderMetrics();
        onResize();
        setTimeout(function () {
          refreshSuggestions('vision', false);
          if (state.selectedVisionId) refreshSuggestions('mission', false);
          if (state.selectedMissionId) refreshSuggestions('project', false);
        }, 0);
      });
    }

    return reload().then(function () {
      return {
        reload: reload,
        getState: function () {
          return state;
        },
      };
    });
  }

  /**
   * Open an in-page overlay listing mission metrics.
   */
  function openMetricsPanel(hostEl, mission, metrics) {
    var GT = global.GoalsTrello;
    var existing = hostEl.querySelector('.goals-metrics-overlay');
    if (existing) existing.remove();

    var root = el('div', 'goals-metrics-overlay');
    root.innerHTML =
      '<div class="goals-metrics-backdrop" data-close></div>' +
      '<div class="goals-metrics-panel" role="dialog" aria-modal="true">' +
      '<header class="goals-metrics-header">' +
      '<h3 class="goals-metrics-title"></h3>' +
      '<button type="button" class="goals-metrics-close" aria-label="Fermer">&times;</button>' +
      '</header>' +
      '<div class="goals-metrics-body"></div>' +
      '</div>';

    var title = root.querySelector('.goals-metrics-title');
    title.textContent = 'Métriques — ' + (mission && mission.name ? mission.name : 'Mission');
    var body = root.querySelector('.goals-metrics-body');

    if (!metrics || !metrics.length) {
      body.appendChild(el('p', 'tp-goals-empty', { text: 'Aucune métrique pour cette mission.' }));
    } else {
      metrics.forEach(function (m) {
        var row = el('div', 'goals-metrics-row' + (m.isPrimary ? ' is-primary' : ''));
        var name = el('div', 'goals-metrics-row-name');
        name.textContent = m.name;
        if (m.isPrimary) {
          name.appendChild(el('span', 'tp-goals-primary-tag', { text: 'Principale' }));
        }
        row.appendChild(name);
        row.appendChild(
          el('div', 'goals-metrics-row-value', {
            text: GT ? GT.formatMetricValue(m) : String(m.currentValue),
          })
        );
        if (m.scaleLabels && m.scaleLabels.length === 2) {
          row.appendChild(
            el('div', 'goals-metrics-row-scale', {
              text: m.scaleLabels[0] + ' → ' + m.scaleLabels[1],
            })
          );
        }
        body.appendChild(row);
      });
    }

    function close() {
      root.remove();
      document.body.classList.remove('goals-metrics-open');
    }
    root.querySelector('[data-close]').addEventListener('click', close);
    root.querySelector('.goals-metrics-close').addEventListener('click', close);
    document.body.classList.add('goals-metrics-open');
    hostEl.appendChild(root);
    return { close: close };
  }

  global.GoalsUI = {
    mountGoalsSettings: mountGoalsSettings,
    openMetricsPanel: openMetricsPanel,
    spellcheckText: spellcheckText,
    directionLabel: directionLabel,
    escapeHtml: escapeHtml,
  };
})(typeof window !== 'undefined' ? window : globalThis);
