/**
 * agent-ui: mount() part 2 of 8.
 * The body of mount runs in order across these parts; its locals live on the per-call state object (M).
 * Order and shared names: see agent-ui.parts.json and docs/architecture.md.
 */
(function (global) {
  'use strict';

  var S = (global.AgentUiParts = global.AgentUiParts || {});
  var P = (global.AgentUiPartsMountMount = global.AgentUiPartsMountMount || { list: [] });

  P.list.push({
    define: function (M) {
    M.scrollMessagesToBottom = function scrollMessagesToBottom() {
      if (!M.messagesEl) return;
      function pin() {
        if (!M.messagesEl) return;
        M.messagesEl.scrollTop = M.messagesEl.scrollHeight;
      }
      pin();
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(function () {
          pin();
          requestAnimationFrame(pin);
        });
      }
      // Suggestions, blocks, and t.sizeTo often grow the log after first paint.
      setTimeout(pin, 0);
      setTimeout(pin, 50);
      setTimeout(pin, 120);
    };
    M.scrollMessagesIfPinned = function scrollMessagesIfPinned(force) {
      if (!M.messagesEl) return;
      if (!force) {
        var slack = 96;
        var dist =
          M.messagesEl.scrollHeight - M.messagesEl.scrollTop - M.messagesEl.clientHeight;
        if (dist > slack) return;
      }
      M.messagesEl.scrollTop = M.messagesEl.scrollHeight;
    };
    M.syncApplySummary = function syncApplySummary() {
      M.field.classList.toggle(
        'has-ai-suggestions',
        M.applySuggestions.length > 0 || M.applySuggestionsLoading || !!M.activeOffer
      );
      M.field.classList.toggle('is-ai-suggestions-loading', M.applySuggestionsLoading || M.listeningAnalyzing);
      M.field.classList.toggle('has-new-message', M.unreadAssistant > 0 && !M.activeOffer);
      M.field.classList.toggle(
        'is-listening',
        M.listeningActive && M.Agent.isConfigured(M.provider) && !M.interviewActive
      );
      if (M.collapse && M.collapse.refreshSummary) M.collapse.refreshSummary();
    };
    M.notifyLayout = function notifyLayout() {
      if (M.chatsUi) M.chatsUi.syncLock(); // runs whenever a turn starts or settles
      M.onLayoutChange();
    };
    M.formatTokenCount = function formatTokenCount(n) {
      if (n == null || !isFinite(n)) return '\u2014';
      var v = Math.round(n);
      if (v >= 1000000) return (v / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
      if (v >= 10000) return Math.round(v / 1000) + 'k';
      if (v >= 1000) return (v / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
      return String(v);
    };
    M.formatCostUsd = function formatCostUsd(n) {
      if (n == null || !isFinite(n)) return '\u2014';
      if (n < 0.0001) return '<\u00a0$0.0001';
      if (n < 0.01) return '$' + n.toFixed(4);
      if (n < 1) return '$' + n.toFixed(3);
      return '$' + n.toFixed(2);
    };
    M.formatLatency = function formatLatency(ms) {
      if (ms == null || !isFinite(ms)) return '\u2014';
      if (ms < 1000) return Math.round(ms) + '\u00a0ms';
      return (ms / 1000).toFixed(1).replace(/\.0$/, '') + '\u00a0s';
    };
    M.formatWindow = function formatWindow(n) {
      if (n == null || !isFinite(n)) return '\u2014';
      if (n >= 1000000) return Math.round(n / 1000000) + 'M';
      if (n >= 1000) return Math.round(n / 1000) + 'k';
      return String(n);
    };
    M.finishReasonLabel = function finishReasonLabel(reason) {
      if (!reason) return '';
      var map = {
        stop: 'termin\u00e9',
        length: 'tronqu\u00e9',
        content_filter: 'filtr\u00e9',
        tool_calls: 'outils',
        function_call: 'fonction'
      };
      return map[reason] || reason;
    };
    M.toneFromThresholds = function toneFromThresholds(value, warnAt, cautionAt, badAt) {
      if (value == null || !isFinite(value)) return 'ok';
      if (value >= badAt) return 'bad';
      if (value >= cautionAt) return 'caution';
      if (value >= warnAt) return 'warn';
      return 'ok';
    };
    M.latencyTone = function latencyTone(ms) {
      return M.toneFromThresholds(ms, 2000, 3500, 5000);
    };
    M.contextTone = function contextTone(fillPercent) {
      return M.toneFromThresholds(fillPercent, 50, 65, 80);
    };
    M.costTone = function costTone(usd) {
      return M.toneFromThresholds(usd, 0.01, 0.02, 0.05);
    };
    M.tokensTone = function tokensTone(totalTokens, fillPercent) {
      if (fillPercent != null && isFinite(fillPercent)) {
        return M.contextTone(fillPercent);
      }
      return M.toneFromThresholds(totalTokens, 6000, 12000, 20000);
    };
    M.memoryTone = function memoryTone(messageCount) {
      return M.toneFromThresholds(messageCount, 12, 24, 40);
    };
    M.finishTone = function finishTone(reason) {
      if (reason === 'length' || reason === 'content_filter') return 'bad';
      return 'ok';
    };
    M.updateSessionStats = function updateSessionStats(usage) {
      if (!usage) return;
      M.sessionStats.turns += 1;
      M.sessionStats.promptTokens += usage.promptTokens || 0;
      M.sessionStats.completionTokens += usage.completionTokens || 0;
      M.sessionStats.totalTokens += usage.totalTokens || 0;
      M.sessionStats.costUsd += usage.costUsd || 0;
      if (usage.estimated) M.sessionStats.estimated = true;
      M.sessionStats.lastUsage = usage;
      M.renderChatStats();

      if (M.Stats && typeof M.Stats.recordTurn === 'function' && M.usageStore) {
        M.usageStore = M.Stats.recordTurn(M.usageStore, usage, { sent: 1, recv: 1 });
        if (M.statsPanelCtl && typeof M.statsPanelCtl.refresh === 'function') {
          M.statsPanelCtl.refresh(M.usageStore);
        }
        M.syncStatsBadge();
        if (M.usageSaver) M.usageSaver.schedule();
      }
    };
    M.syncStatusControls = function syncStatusControls() {
      var showInfo = M.statusLevel !== 'none';
      var showDebug = M.statusLevel === 'full';
      // Panel stays (it holds the mode picker); only the stats line follows statusLevel.
      M.infoEl.hidden = false;
      M.statsEl.hidden = !showInfo;
      M.debugBtn.hidden = !showDebug;
      if (!showDebug && M.debugOpen) {
        M.setDebugOpen(false);
      } else {
        M.debugPanel.hidden = !M.debugOpen;
      }
      if (showInfo) M.renderChatStats();
      else M.statsEl.replaceChildren();
      M.notifyLayout();
    };
    M.prettyJson = function prettyJson(value) {
      if (value == null) return '';
      if (typeof value === 'string') {
        try {
          return JSON.stringify(JSON.parse(value), null, 2);
        } catch (e) {
          return value;
        }
      }
      try {
        return JSON.stringify(value, null, 2);
      } catch (e) {
        return String(value);
      }
    };
    M.pushDebugEntry = function pushDebugEntry(entry) {
      if (!entry) return;
      M.debugLog.push(entry);
      if (M.debugLog.length > 40) M.debugLog.shift();
      M.selectedDebugId = entry.id || M.selectedDebugId;
      if (M.statusLevel === 'full' && M.debugOpen) M.renderDebugPanel();
      M.notifyLayout();
    };
    M.setDebugOpen = function setDebugOpen(open) {
      M.debugOpen = !!open && M.statusLevel === 'full';
      M.debugPanel.hidden = !M.debugOpen;
      M.debugBtn.classList.toggle('is-active', M.debugOpen);
      M.debugBtn.setAttribute('aria-expanded', M.debugOpen ? 'true' : 'false');
      if (M.debugOpen) M.renderDebugPanel();
      M.notifyLayout();
    };
    M.renderMetricsBlock = function renderMetricsBlock(usage) {
      var wrap = S.el('div', 'agent-debug-metrics');
      if (!usage) {
        wrap.appendChild(S.el('p', 'agent-debug-empty', { text: 'Aucune m\u00e9trique.' }));
        return wrap;
      }
      var rows = [
        ['Tokens prompt', M.formatTokenCount(usage.promptTokens)],
        ['Tokens compl\u00e9tion', M.formatTokenCount(usage.completionTokens)],
        ['Tokens total', M.formatTokenCount(usage.totalTokens)],
        ['Co\u00fbt estim\u00e9', '\u2248' + M.formatCostUsd(usage.costUsd)],
        ['Latence', M.formatLatency(usage.latencyMs)],
        ['Mod\u00e8le', usage.model || '\u2014'],
        ['Fin', M.finishReasonLabel(usage.finishReason) || usage.finishReason || '\u2014'],
        ['Estim\u00e9', usage.estimated ? 'oui' : 'non']
      ];
      if (usage.cachedTokens != null) {
        rows.push(['Cache', M.formatTokenCount(usage.cachedTokens)]);
      }
      if (usage.reasoningTokens != null) {
        rows.push(['Raisonnement', M.formatTokenCount(usage.reasoningTokens)]);
      }
      if (usage.historyTurns != null) {
        rows.push(['Historique (tours)', String(usage.historyTurns)]);
      }
      var ctx = usage.context || {};
      if (ctx.requestTokens != null || ctx.windowTokens != null) {
        rows.push([
          'Contexte',
          M.formatTokenCount(ctx.requestTokens) +
            ' / ' +
            M.formatWindow(ctx.windowTokens) +
            (ctx.fillPercent != null ? ' (' + ctx.fillPercent + '%)' : '')
        ]);
      }
      if (ctx.messageCount != null) {
        rows.push(['Messages envoy\u00e9s', String(ctx.messageCount)]);
      }
      if (ctx.systemChars != null) {
        rows.push([
          'Caract\u00e8res',
          'sys ' +
            M.formatTokenCount(ctx.systemChars) +
            ' \u00b7 hist ' +
            M.formatTokenCount(ctx.historyChars) +
            ' \u00b7 user ' +
            M.formatTokenCount(ctx.userChars)
        ]);
      }
      var dl = S.el('dl', 'agent-debug-metric-list');
      rows.forEach(function (pair) {
        var row = S.el('div', 'agent-debug-metric-row');
        row.appendChild(S.el('dt', null, { text: pair[0] }));
        row.appendChild(S.el('dd', null, { text: pair[1] }));
        dl.appendChild(row);
      });
      wrap.appendChild(dl);
      return wrap;
    };
    M.renderDebugPanel = function renderDebugPanel() {
      M.debugPanel.replaceChildren();

      var toolbar = S.el('div', 'agent-debug-toolbar');
      toolbar.appendChild(
        S.el('span', 'agent-debug-toolbar-title', { text: 'D\u00e9bogage' })
      );
      var clearBtn = S.el('button', 'agent-debug-clear', {
        type: 'button',
        text: 'Effacer'
      });
      clearBtn.disabled = !M.debugLog.length;
      clearBtn.addEventListener('click', function () {
        M.debugLog = [];
        M.selectedDebugId = null;
        M.renderDebugPanel();
        M.notifyLayout();
      });
      toolbar.appendChild(clearBtn);
      M.debugPanel.appendChild(toolbar);

      if (!M.debugLog.length) {
        M.debugPanel.appendChild(
          S.el('p', 'agent-debug-empty', {
            text: 'Rien pour l\u2019instant. Envoyez un message ou rechargez les suggestions.'
          })
        );
        return;
      }

      var list = S.el('div', 'agent-debug-list', { role: 'list' });
      var selected = null;
      for (var i = 0; i < M.debugLog.length; i++) {
        if (M.debugLog[i].id === M.selectedDebugId) {
          selected = M.debugLog[i];
          break;
        }
      }
      if (!selected) selected = M.debugLog[M.debugLog.length - 1];
      M.selectedDebugId = selected && selected.id;

      M.debugLog
        .slice()
        .reverse()
        .forEach(function (entry) {
          var item = S.el('button', 'agent-debug-list-item', { type: 'button', role: 'listitem' });
          if (entry.id === M.selectedDebugId) item.classList.add('is-active');
          if (entry.ok === false) item.classList.add('is-fail');
          var when = entry.startedAt
            ? new Date(entry.startedAt).toLocaleTimeString()
            : '';
          item.appendChild(
            S.el('span', 'agent-debug-list-label', {
              text: (entry.label || entry.kind || 'requ\u00eate') + (when ? ' · ' + when : '')
            })
          );
          var metaBits = [];
          if (entry.latencyMs != null) metaBits.push(M.formatLatency(entry.latencyMs));
          if (entry.ok === false) metaBits.push('erreur');
          else if (entry.usage && entry.usage.totalTokens != null) {
            metaBits.push(M.formatTokenCount(entry.usage.totalTokens) + ' tok');
          }
          if (metaBits.length) {
            item.appendChild(
              S.el('span', 'agent-debug-list-meta', { text: metaBits.join(' · ') })
            );
          }
          item.addEventListener('click', function () {
            M.selectedDebugId = entry.id;
            M.renderDebugPanel();
            M.notifyLayout();
          });
          list.appendChild(item);
        });
      M.debugPanel.appendChild(list);

      if (!selected) return;

      var detail = S.el('div', 'agent-debug-detail');
      if (selected.error) {
        detail.appendChild(
          S.el('p', 'agent-debug-error', { text: selected.error })
        );
      }

      function addSection(title, contentNode) {
        var sectionNode = S.el('details', 'agent-debug-section');
        sectionNode.open = true;
        sectionNode.appendChild(S.el('summary', null, { text: title }));
        var bodyNode = S.el('div', 'agent-debug-section-body');
        bodyNode.appendChild(contentNode);
        sectionNode.appendChild(bodyNode);
        detail.appendChild(sectionNode);
      }

      addSection('M\u00e9triques', M.renderMetricsBlock(selected.usage));

      var req = selected.request || null;
      var reqPre = S.el('pre', 'agent-debug-pre');
      reqPre.textContent = M.prettyJson(
        req
          ? {
              url: req.url,
              method: req.method,
              status: req.status,
              model: req.model,
              stream: req.stream,
              jsonMode: req.jsonMode,
              temperature: req.temperature,
              max_tokens: req.max_tokens,
              messageCount: req.messageCount,
              note: req.note,
              error: req.error,
              body: req.body
            }
          : null
      ) || '(aucune requ\u00eate)';
      addSection('Requ\u00eate sortante', reqPre);

      var res = selected.response || null;
      var resPre = S.el('pre', 'agent-debug-pre');
      resPre.textContent = M.prettyJson(
        res
          ? {
              status: res.status,
              content: res.content,
              raw: res.raw,
              parsed: res.parsed,
              suggestions: res.suggestions
            }
          : null
      ) || '(aucune r\u00e9ponse)';
      addSection('R\u00e9ponse / sortie brute', resPre);

      if (selected.attempts && selected.attempts.length) {
        var attemptsPre = S.el('pre', 'agent-debug-pre');
        attemptsPre.textContent = M.prettyJson(selected.attempts);
        addSection('Tentatives (' + selected.attempts.length + ')', attemptsPre);
      }

      M.debugPanel.appendChild(detail);
    };
    M.renderChatStats = function renderChatStats() {
      if (M.statusLevel === 'none') {
        M.statsEl.replaceChildren();
        M.notifyLayout();
        return;
      }

      var usage = M.sessionStats.lastUsage;
      var isFull = M.statusLevel === 'full';
      M.statsEl.replaceChildren();

      function addRow(className, parts) {
        var row = S.el('div', 'agent-chat-stats-row' + (className ? ' ' + className : ''));
        parts.forEach(function (part, idx) {
          if (idx > 0) {
            row.appendChild(S.el('span', 'agent-chat-stats-sep', { text: '\u00b7' }));
          }
          var tone = part.tone || 'ok';
          var cell = S.el('span', 'agent-chat-stats-item is-' + tone);
          if (part.label) {
            cell.appendChild(S.el('span', 'agent-chat-stats-label', { text: part.label }));
            cell.appendChild(document.createTextNode('\u00a0'));
          }
          cell.appendChild(
            S.el('span', 'agent-chat-stats-value is-' + tone, { text: part.value })
          );
          if (part.title) cell.title = part.title;
          row.appendChild(cell);
        });
        M.statsEl.appendChild(row);
      }

      if (!M.infoExpanded) {
        if (usage && M.sessionStats.turns >= 1) {
          addRow('is-summary', [
            { value: M.formatTokenCount(M.sessionStats.totalTokens) + ' tokens' },
            { value: '≈' + M.formatCostUsd(M.sessionStats.costUsd) },
            {
              value:
                M.sessionStats.turns + ' tour' + (M.sessionStats.turns > 1 ? 's' : ''),
              title: 'Totaux de cette conversation'
            }
          ]);
        }
        M.notifyLayout();
        return;
      }

      if (!usage || M.sessionStats.turns < 1) {
        addRow(
          '',
          [
            { label: 'Tokens', value: '\u2014', title: 'Aucun \u00e9change pour l\u2019instant' },
            { label: 'Co\u00fbt', value: '\u2014' },
            { label: 'Contexte', value: '\u2014' },
            {
              label: 'M\u00e9moire',
              value: M.history.length + ' msg',
              title: 'Messages conserv\u00e9s dans cette session',
              tone: M.memoryTone(M.history.length)
            }
          ].concat(
            isFull
              ? [
                  { label: 'Latence', value: '\u2014' },
                  {
                    label: 'Session',
                    value: '0 tour',
                    title: 'Totaux de cette conversation'
                  }
                ]
              : []
          )
        );
        M.notifyLayout();
        return;
      }

      var tokenApprox = usage.estimated || M.sessionStats.estimated ? '\u2248' : '';
      var tokenTitle = usage.estimated
        ? 'Estimation (le fournisseur n\'a pas renvoy\u00e9 usage)'
        : 'Tokens du dernier \u00e9change';
      var lastTokenValue =
        tokenApprox +
        M.formatTokenCount(usage.totalTokens) +
        ' (' +
        M.formatTokenCount(usage.promptTokens) +
        '\u2191 ' +
        M.formatTokenCount(usage.completionTokens) +
        '\u2193)';

      var ctx = usage.context || {};
      var fill = typeof ctx.fillPercent === 'number' ? ctx.fillPercent : null;
      var compressionHint =
        fill != null && fill >= 50
          ? 'Contexte charg\u00e9 \u2014 l\'historique allonge les requ\u00eates'
          : 'Part du contexte utilis\u00e9e par le prompt + l\'historique';

      var parts = [
        {
          label: 'Tokens',
          value: lastTokenValue,
          title: tokenTitle,
          tone: M.tokensTone(usage.totalTokens, fill)
        },
        {
          label: 'Co\u00fbt',
          value: '\u2248' + M.formatCostUsd(usage.costUsd),
          title: 'Estimation selon le tarif publique du mod\u00e8le (non facturation)',
          tone: M.costTone(usage.costUsd)
        },
        {
          label: 'Contexte',
          value:
            fill != null
              ? fill + '% (' + M.formatTokenCount(ctx.requestTokens) + '/' + M.formatWindow(ctx.windowTokens) + ')'
              : M.formatTokenCount(ctx.requestTokens),
          title: compressionHint,
          tone: M.contextTone(fill)
        },
        {
          label: 'M\u00e9moire',
          value: M.history.length + ' msg',
          title: 'Messages conserv\u00e9s dans cette session',
          tone: M.memoryTone(M.history.length)
        }
      ];
      if (isFull) {
        parts.push({
          label: 'Latence',
          value: M.formatLatency(usage.latencyMs),
          tone: M.latencyTone(usage.latencyMs)
        });
        if (usage.cachedTokens != null && usage.cachedTokens > 0) {
          parts.push({
            label: 'Cache',
            value: M.formatTokenCount(usage.cachedTokens),
            title: 'Tokens d\'entr\u00e9e en cache',
            tone: 'ok'
          });
        }
        if (usage.reasoningTokens != null && usage.reasoningTokens > 0) {
          parts.push({
            label: 'Raisonnement',
            value: M.formatTokenCount(usage.reasoningTokens),
            tone: M.toneFromThresholds(usage.reasoningTokens, 2000, 5000, 10000)
          });
        }
        parts.push(
          {
            label: 'Compression',
            value: 'aucune',
            title:
              'L\'historique est renvoy\u00e9 en entier \u00e0 chaque tour (pas de r\u00e9sum\u00e9 ni troncature)',
            tone: fill != null && fill >= 65 ? 'warn' : 'ok'
          },
          {
            label: 'Session',
            value:
              M.formatTokenCount(M.sessionStats.totalTokens) +
              ' \u00b7 \u2248' +
              M.formatCostUsd(M.sessionStats.costUsd) +
              ' \u00b7 ' +
              M.sessionStats.turns +
              ' tour' +
              (M.sessionStats.turns > 1 ? 's' : ''),
            title: 'Totaux de cette conversation',
            tone: M.costTone(M.sessionStats.costUsd)
          }
        );
        if (usage.model) {
          parts.push({
            label: 'Mod\u00e8le',
            value: usage.model,
            title: usage.model,
            tone: 'ok'
          });
        }
        var fr = M.finishReasonLabel(usage.finishReason);
        if (fr) {
          parts.push({
            label: 'Fin',
            value: fr,
            tone: M.finishTone(usage.finishReason)
          });
        }
      }
      addRow('', parts);
      M.notifyLayout();
    };
    M.setError = function setError(msg) {
      if (!msg) {
        M.errorEl.hidden = true;
        M.errorEl.textContent = '';
        return;
      }
      M.errorEl.hidden = false;
      M.errorEl.textContent = msg;
      M.notifyLayout();
    };
    M.setSettingsStatus = function setSettingsStatus(msg, tone) {
      if (!msg) {
        M.settingsStatus.hidden = true;
        M.settingsStatus.textContent = '';
        M.settingsStatus.className = 'agent-settings-status';
        return;
      }
      M.settingsStatus.hidden = false;
      M.settingsStatus.textContent = msg;
      M.settingsStatus.className =
        'agent-settings-status' + (tone ? ' is-' + tone : '');
      M.notifyLayout();
    };
    M.syncPresetButtons = function syncPresetButtons() {
      Object.keys(M.presetButtons).forEach(function (id) {
        M.presetButtons[id].classList.toggle('is-active', M.provider.preset === id);
      });
    };
    M.ensureModelSelectValue = function ensureModelSelectValue(modelId) {
      var id = modelId || '';
      if (!id) return;
      var exists = Array.prototype.some.call(M.modelSelect.options, function (opt) {
        return opt.value === id;
      });
      if (!exists) {
        M.modelSelect.appendChild(S.el('option', null, { value: id, text: id }));
      }
      M.modelSelect.value = id;
    };
    M.syncModelControls = function syncModelControls() {
      var isOpenAI = M.provider.preset === 'openai';
      M.modelSelectField.hidden = !isOpenAI;
      M.modelInputField.hidden = isOpenAI;
      if (isOpenAI) {
        M.ensureModelSelectValue(M.provider.model || M.Agent.PRESETS.openai.model);
      } else {
        M.modelInput.value = M.provider.model || '';
      }
    };
    M.getAgentColorValue = function getAgentColorValue() {
      if (M.agentColorPicker && typeof M.agentColorPicker.getValue === 'function') {
        return M.agentColorPicker.getValue() || M.agentIdentity.agentColor || 'orange';
      }
      return M.agentIdentity.agentColor || 'orange';
    };
    M.setAgentColorValue = function setAgentColorValue(color) {
      if (M.agentColorPicker && typeof M.agentColorPicker.setValue === 'function') {
        M.agentColorPicker.setValue(color);
      }
    };
    M.onAgentColorPicked = function onAgentColorPicked(nextColor) {
      var curName = (M.agentNameInput.value || '').trim();
      var isStock =
        !curName ||
        (global.UserProfile &&
          global.UserProfile.isStockAgentName &&
          global.UserProfile.isStockAgentName(curName));
      if (isStock && global.UserProfile && global.UserProfile.pickAgentNameForColor) {
        M.agentNameInput.value = global.UserProfile.pickAgentNameForColor(nextColor);
      }
      M.persistAgentIdentity({
        agentName: (M.agentNameInput.value || '').trim() || M.agentIdentity.agentName,
        agentPersonality:
          (M.agentPersonalityInput.value || '').trim() ||
          M.agentIdentity.agentPersonality,
        agentColor: nextColor,
        agentFace: M.agentIdentity.agentFace
      }).catch(function (err) {
        console.error('AgentUI color pick failed', err);
      });
    };
    M.ensureAgentColorPicker = function ensureAgentColorPicker(selected) {
      var initial = selected || M.agentIdentity.agentColor || 'orange';
      if (
        M.agentColorPicker &&
        typeof M.agentColorPicker.setValue === 'function'
      ) {
        M.agentColorPicker.setValue(initial);
        return M.agentColorPicker;
      }
      if (
        global.UserProfile &&
        typeof global.UserProfile.mountAgentColorPicker === 'function'
      ) {
        M.agentColorPicker = global.UserProfile.mountAgentColorPicker(
          M.agentColorPickerHost,
          {
            value: initial,
            onChange: M.onAgentColorPicked
          }
        );
        return M.agentColorPicker;
      }
      // Fallback if UserProfile is unavailable: plain text readout.
      M.agentColorPickerHost.textContent = initial;
      M.agentColorPicker = {
        getValue: function () {
          return M.agentIdentity.agentColor || 'orange';
        },
        setValue: function (color) {
          M.agentColorPickerHost.textContent = color || 'orange';
        }
      };
      return M.agentColorPicker;
    };
    M.fillAgentColorSelect = function fillAgentColorSelect(selected) {
      M.ensureAgentColorPicker(selected);
    };
    M.fillAgentFacePicker = function fillAgentFacePicker(selected) {
      var keys =
        (global.UserProfile && global.UserProfile.AGENT_FACE_KEYS) || [
          'classic',
          'soft',
          'bold',
          'sly',
          'calm',
          'spark'
        ];
      var labels =
        (global.UserProfile && global.UserProfile.AGENT_FACE_LABELS) || {};
      var current = M.normalizeAgentFace(selected || M.agentIdentity.agentFace);
      var color = M.getAgentColorValue();
      var aura = M.normalizeFaceAura(color) || 'orange';
      M.agentFacePicker.replaceChildren();
      keys.forEach(function (key) {
        var label = labels[key] || key;
        var btn = S.el('button', 'agent-face-pick', {
          type: 'button',
          'data-face': key,
          'aria-label': label,
          title: label
        });
        btn.setAttribute('role', 'radio');
        btn.setAttribute('aria-checked', key === current ? 'true' : 'false');
        btn.classList.toggle('is-selected', key === current);
        var thumb = M.createAssistantFace('happy', aura, key);
        thumb.classList.add('agent-face--pick-thumb');
        // Picker thumbs are decorative; disable spin/puke interactions.
        thumb.style.pointerEvents = 'none';
        btn.appendChild(thumb);
        btn.appendChild(S.el('span', 'agent-face-pick-label', { text: label }));
        btn.addEventListener('click', function () {
          if (M.normalizeAgentFace(M.agentIdentity.agentFace) === key) {
            M.syncAgentAvatarPreview();
            return;
          }
          M.persistAgentIdentity({
            agentName: (M.agentNameInput.value || '').trim() || M.agentIdentity.agentName,
            agentPersonality:
              (M.agentPersonalityInput.value || '').trim() ||
              M.agentIdentity.agentPersonality,
            agentColor: M.getAgentColorValue(),
            agentFace: key
          }).catch(function (err) {
            console.error('AgentUI face pick failed', err);
          });
        });
        M.agentFacePicker.appendChild(btn);
      });
    };
    M.syncAgentAvatarPreview = function syncAgentAvatarPreview() {
      if (!M.agentAvatarPreviewFaceHost) return;
      var color = M.getAgentColorValue();
      var aura = M.normalizeFaceAura(color) || 'orange';
      var style = M.normalizeAgentFace(M.agentIdentity.agentFace);
      var name =
        (M.agentNameInput && String(M.agentNameInput.value || '').trim()) ||
        M.agentIdentity.agentName ||
        'Assistant';
      var face = M.agentAvatarPreviewFaceHost.querySelector('.agent-face');
      var needNew =
        !face ||
        face.getAttribute('data-face') !== style ||
        face.getAttribute('data-aura') !== M.auraToken(aura);
      if (needNew) {
        face = M.createAssistantFace('happy', aura, style);
        face.classList.add('agent-face--preview');
        M.agentAvatarPreviewFaceHost.replaceChildren(face);
      } else {
        M.applyFaceAura(face, aura);
        M.applyFaceStyle(face, style);
        if (face.getAttribute('data-emotion') !== 'happy') {
          face.setAttribute('data-emotion', 'happy');
          face.className =
            'agent-face agent-face--happy agent-face--preview';
          M.applyFaceStyle(face, style);
        }
      }
      if (M.agentAvatarPreviewName) {
        M.agentAvatarPreviewName.textContent = name;
      }
      var styleLabel =
        (global.UserProfile &&
          global.UserProfile.AGENT_FACE_LABELS &&
          global.UserProfile.AGENT_FACE_LABELS[style]) ||
        style;
      if (M.agentAvatarPreviewCaption) {
        M.agentAvatarPreviewCaption.textContent = 'Aper\u00e7u \u00b7 ' + styleLabel;
      }
      // Keep picker selection + thumb colors in sync without full rebuild when possible.
      var picks = M.agentFacePicker.querySelectorAll('.agent-face-pick');
      if (!picks.length) {
        M.fillAgentFacePicker(style);
      } else {
        for (var i = 0; i < picks.length; i++) {
          var pick = picks[i];
          var key = pick.getAttribute('data-face');
          var selected = key === style;
          pick.classList.toggle('is-selected', selected);
          pick.setAttribute('aria-checked', selected ? 'true' : 'false');
          var thumb = pick.querySelector('.agent-face');
          if (thumb) M.applyFaceAura(thumb, aura);
        }
      }
    };
    M.applyAgentIdentity = function applyAgentIdentity(profile) {
      var ensured =
        global.UserProfile && typeof global.UserProfile.ensureAgentIdentity === 'function'
          ? global.UserProfile.ensureAgentIdentity(profile || {})
          : { profile: profile || {} };
      var p = ensured.profile || {};
      M.agentIdentity = {
        agentName: p.agentName || '',
        agentPersonality: p.agentPersonality || '',
        agentColor: p.agentColor || 'orange',
        agentFace: M.normalizeAgentFace(p.agentFace)
      };
      M.agentNameInput.value = M.agentIdentity.agentName;
      M.agentPersonalityInput.value = M.agentIdentity.agentPersonality || '';
      M.fillAgentColorSelect(M.agentIdentity.agentColor);
      M.fillAgentFacePicker(M.agentIdentity.agentFace);
      M.updateAgentSectionTitle();
      M.syncAgentAvatarPreview();
    };
    M.readAgentIdentityForm = function readAgentIdentityForm() {
      var color = M.getAgentColorValue();
      if (global.UserProfile && typeof global.UserProfile.normalizeAgentColor === 'function') {
        color = global.UserProfile.normalizeAgentColor(color) || color;
      }
      var face = M.agentIdentity.agentFace || 'classic';
      var selectedPick = M.agentFacePicker.querySelector('.agent-face-pick.is-selected');
      if (selectedPick) {
        face = selectedPick.getAttribute('data-face') || face;
      }
      return {
        agentName: (M.agentNameInput.value || '').trim(),
        agentPersonality: (M.agentPersonalityInput.value || '').trim(),
        agentColor: color,
        agentFace: M.normalizeAgentFace(face)
      };
    };
    M.updateAgentSectionTitle = function updateAgentSectionTitle() {
      var name = 'Assistant';
      if (M.chrome.title) M.chrome.title.textContent = name;
      if (!M.chrome.collapseBtn) return;
      M.chrome.collapseLabel = 'Replier ' + name;
      M.chrome.expandLabel = 'D\u00e9velopper ' + name;
      M.chrome.enableLabel = 'Activer ' + name;
      if (M.chrome.checkbox) {
        M.chrome.checkbox.setAttribute('aria-label', M.chrome.enableLabel);
      }
      var expanded =
        M.chrome.collapseBtn.getAttribute('aria-expanded') === 'true';
      M.chrome.collapseBtn.setAttribute(
        'aria-label',
        expanded ? M.chrome.collapseLabel : M.chrome.expandLabel
      );
    };
    M.persistAgentIdentity = async function persistAgentIdentity(nextIdentity) {
      var next = nextIdentity || M.readAgentIdentityForm();
      if (!next.agentName && global.UserProfile && global.UserProfile.pickAgentNameForColor) {
        next.agentName = global.UserProfile.pickAgentNameForColor(next.agentColor);
      }
      var prevColor = M.agentIdentity.agentColor;
      var prevFace = M.agentIdentity.agentFace;
      M.agentIdentity = {
        agentName: next.agentName || '',
        agentPersonality: next.agentPersonality || '',
        agentColor: next.agentColor || 'orange',
        agentFace: M.normalizeAgentFace(next.agentFace)
      };
      M.agentNameInput.value = M.agentIdentity.agentName;
      M.agentPersonalityInput.value = M.agentIdentity.agentPersonality;
      M.fillAgentColorSelect(M.agentIdentity.agentColor);
      M.fillAgentFacePicker(M.agentIdentity.agentFace);
      M.updateAgentSectionTitle();
      M.syncAgentAvatarPreview();
      if (prevColor !== M.agentIdentity.agentColor) {
        M.refreshAssistantFacesAura();
      }
      if (prevFace !== M.agentIdentity.agentFace) {
        M.refreshAssistantFacesStyle();
      }
      if (!M.t || !global.UserProfile || typeof global.UserProfile.load !== 'function') {
        return M.agentIdentity;
      }
      var profile = await global.UserProfile.load(M.t);
      profile.agentName = M.agentIdentity.agentName;
      profile.agentPersonality = M.agentIdentity.agentPersonality;
      profile.agentColor = M.agentIdentity.agentColor;
      profile.agentFace = M.agentIdentity.agentFace;
      await global.UserProfile.save(M.t, profile);
      // Keep popup's live profile cache in sync for the next chat turn.
      if (typeof M.bridge.getProfile === 'function') {
        var live = M.bridge.getProfile();
        if (live && typeof live === 'object') {
          live.agentName = profile.agentName;
          live.agentPersonality = profile.agentPersonality;
          live.agentColor = profile.agentColor;
          live.agentFace = profile.agentFace;
        }
      }
      return M.agentIdentity;
    };
    M.refreshPeopleDirectory = async function refreshPeopleDirectory() {
      if (typeof M.bridge.refreshPeople === 'function') {
        try {
          await M.bridge.refreshPeople();
          return;
        } catch (e) { /* fall through */ }
      }
      if (!M.t || !global.People || typeof global.People.load !== 'function') {
        return;
      }
      try {
        var dir = await global.People.load(M.t, {
          maxAgeMs:
            (global.People && global.People.AGENT_REFRESH_MAX_AGE_MS) || 5000
        });
        if (typeof M.options.onPeopleLoaded === 'function') {
          M.options.onPeopleLoaded(dir);
        }
      } catch (err) {
        console.error('AgentUI refreshPeople failed', err);
      }
    };
    M.refreshPlacesDirectory = async function refreshPlacesDirectory() {
      if (typeof M.bridge.refreshPlaces === 'function') {
        try {
          await M.bridge.refreshPlaces();
          return;
        } catch (e) { /* fall through */ }
      }
      if (!M.t || !global.Places || typeof global.Places.load !== 'function') {
        return;
      }
      try {
        var dir = await global.Places.load(M.t, {
          maxAgeMs:
            (global.Places && global.Places.AGENT_REFRESH_MAX_AGE_MS) || 5000
        });
        if (typeof M.options.applyPlaces === 'function') {
          await Promise.resolve(M.options.applyPlaces(dir));
        }
      } catch (err) {
        console.error('AgentUI refreshPlaces failed', err);
      }
    };
    M.hydrateCardContextCaches = async function hydrateCardContextCaches() {
      try {
        await S.hydrateBridgeCaches(M.bridge);
      } catch (e) { /* keep prior caches */ }
    };
    M.prepareTurnContext = async function prepareTurnContext() {
      await Promise.all([
        M.refreshPeopleDirectory().catch(function () {}),
        M.refreshPlacesDirectory().catch(function () {}),
        M.hydrateCardContextCaches()
      ]);
    };
    M.fillSettingsForm = function fillSettingsForm() {
      M.apiKeyInput.value = M.provider.apiKey || '';
      M.baseUrlInput.value = M.provider.baseUrl || '';
      // OpenAI / OpenRouter presets lock URL; custom unlocks.
      if (M.provider.preset === 'openai' || M.provider.preset === 'openrouter') {
        M.baseUrlInput.readOnly = true;
      } else {
        M.baseUrlInput.readOnly = false;
      }
      M.syncModelControls();
      var mode =
        typeof M.Agent.normalizeModelMode === 'function'
          ? M.Agent.normalizeModelMode(M.provider.modelMode)
          : M.provider.modelMode || 'auto';
      M.modelModeSelect.value = mode;
      M.syncPresetButtons();
      if (M.collapse && M.collapse.refreshSummary) M.collapse.refreshSummary();
      M.updateComposerEnabled();
      // Empty CTA only for unset providers; chat history or a configured provider hide it.
      // (.tp-link { display:inline-block } would otherwise override the hidden attribute.)
      var configured = M.Agent.isConfigured(M.provider);
      M.emptyState.classList.toggle('is-hidden', M.history.length > 0 || configured);
      M.emptyConfigBtn.hidden = configured;
      M.settingsBtn.title = configured ? 'Param\u00e8tres' : 'Configurer l\'assistant';
      M.settingsBtn.setAttribute(
        'aria-label',
        configured ? 'Param\u00e8tres de l\'assistant' : 'Configurer l\'assistant'
      );
      M.syncProviderFold();
      if (!configured) M.providerDetails.open = true;
    };
    M.readSettingsForm = function readSettingsForm() {
      var isOpenAI = M.provider.preset === 'openai';
      var next = M.Agent.normalizeProvider({
        preset: M.provider.preset || 'openai',
        apiKey: M.apiKeyInput.value,
        baseUrl: M.baseUrlInput.value,
        model: isOpenAI ? M.modelSelect.value : M.modelInput.value,
        modelMode: M.modelModeSelect.value,
        verifiedFingerprint: M.provider.verifiedFingerprint || ''
      });
      // Config changed vs last verified fingerprint → not verified anymore.
      if (!M.Agent.isVerified(next)) {
        next = M.Agent.clearVerified(next);
      }
      return next;
    };
    M.applyPreset = function applyPreset(id) {
      var preset = M.Agent.PRESETS[id] || M.Agent.PRESETS.openai;
      var currentModel =
        (M.provider.preset === 'openai' ? M.modelSelect.value : M.modelInput.value) ||
        M.provider.model ||
        '';
      var next = {
        preset: preset.id,
        apiKey: M.apiKeyInput.value,
        baseUrl: preset.baseUrl || M.baseUrlInput.value,
        model: M.provider.preset === preset.id ? currentModel : preset.model || currentModel,
        modelMode: M.modelModeSelect.value || M.provider.modelMode || 'auto'
      };
      if (preset.id === 'custom') {
        next.baseUrl = M.baseUrlInput.value || M.provider.baseUrl || '';
        next.model = M.modelInput.value || currentModel || '';
      }
      M.provider = M.Agent.normalizeProvider(next);
      M.fillSettingsForm();
    };
    M.setSettingsOpen = function setSettingsOpen(open) {
      M.settingsOpen = !!open;
      M.settingsPanel.hidden = !M.settingsOpen;
      M.body.classList.toggle('is-settings-open', M.settingsOpen);
      M.settingsBtn.classList.toggle('is-active', M.settingsOpen);
      M.settingsBtn.setAttribute('aria-expanded', M.settingsOpen ? 'true' : 'false');
      M.notifyLayout();
    };
    M.updateComposerEnabled = function updateComposerEnabled() {
      var configured = M.Agent.isConfigured(M.provider);
      // Keep composer typable during in-flight turns; extra sends go to messageQueue.
      M.composer.hidden = !configured;
      M.composerFoot.hidden = !configured;
      M.sendBtn.disabled = !configured;
      M.modelModeSelect.disabled = !configured;
      M.input.disabled = !configured;
      if (!configured) {
        M.clearSuggestions();
        M.clearApplySuggestions();
        M.stopListening();
      } else {
        M.setSuggestionsBusy(M.pending);
        M.setApplySuggestionsBusy(M.pending);
        if (M.settleReady && !M.interviewActive && !M.isProjectScope) M.startListening();
      }
    };
    M.activateQueuedUserRow = function activateQueuedUserRow(row) {
      if (!row) return;
      row.classList.remove('is-queued');
      row.removeAttribute('aria-label');
      var note = row.querySelector('.agent-msg-note');
      if (note && note.parentNode) note.parentNode.removeChild(note);
    };
    M.setQueuedRowText = function setQueuedRowText(row, text) {
      if (!row) return;
      var bubble = row.querySelector('.agent-msg-bubble');
      if (bubble) bubble.textContent = text;
    };
    M.findLastVisibleQueuedEntry = function findLastVisibleQueuedEntry() {
      for (var i = M.messageQueue.length - 1; i >= 0; i--) {
        var entry = M.messageQueue[i];
        if (entry && entry.row && !entry.silent && !entry.isSelfPrompt) {
          return entry;
        }
      }
      return null;
    };
    },
    run: function (M) {
    M.bridge.setAgentName = async function (name) {
      var trimmed = String(name || '').trim();
      if (!trimmed) return { ok: false, reason: 'empty-name' };
      var maxLen =
        (global.UserProfile && global.UserProfile.MAX_AGENT_NAME) || 40;
      if (trimmed.length > maxLen) trimmed = trimmed.slice(0, maxLen);
      await M.persistAgentIdentity({
        agentName: trimmed,
        agentPersonality: M.agentIdentity.agentPersonality,
        agentColor: M.agentIdentity.agentColor,
        agentFace: M.agentIdentity.agentFace
      });
      return { ok: true, name: M.agentIdentity.agentName };
    };
    M.bridge.setAgentColor = async function (color) {
      var normalized = M.normalizeFaceAura(color);
      if (!normalized) return { ok: false, reason: 'invalid-color' };
      await M.persistAgentIdentity({
        agentName: M.agentIdentity.agentName,
        agentPersonality: M.agentIdentity.agentPersonality,
        agentColor: normalized,
        agentFace: M.agentIdentity.agentFace
      });
      return { ok: true, color: M.agentIdentity.agentColor };
    };
    M.bridge.setAgentPersonality = async function (personality) {
      var trimmed = String(personality || '').trim();
      if (!trimmed) return { ok: false, reason: 'empty-personality' };
      var maxLen =
        (global.UserProfile && global.UserProfile.MAX_AGENT_PERSONALITY) || 900;
      if (trimmed.length > maxLen) trimmed = trimmed.slice(0, maxLen);
      await M.persistAgentIdentity({
        agentName: M.agentIdentity.agentName,
        agentPersonality: trimmed,
        agentColor: M.agentIdentity.agentColor,
        agentFace: M.agentIdentity.agentFace
      });
      return { ok: true, personality: M.agentIdentity.agentPersonality };
    };
    M.bridge.upsertPerson = async function (patch) {
      if (!global.People || typeof global.People.upsert !== 'function') {
        return { ok: false, reason: 'people-unavailable' };
      }
      var current =
        typeof M.bridge.getPeople === 'function' ? M.bridge.getPeople() : null;
      var next = global.People.upsert(current, patch || {});
      if (typeof M.options.applyPeople === 'function') {
        await Promise.resolve(M.options.applyPeople(next));
      } else if (M.t && typeof global.People.save === 'function') {
        next = await global.People.save(M.t, next);
      }
      if (typeof M.bridge.getPeople === 'function') {
        // Prefer live cache update via applyPeople; getPeople should reflect next.
      }
      var found = null;
      if (patch && patch.name) {
        found = global.People.findByAliasOrName(next, patch.name);
      } else if (patch && (patch.matchText || patch.id)) {
        found = global.People.findByAliasOrName(
          next,
          patch.matchText || patch.id
        );
      }
      if (!found && next.people && next.people.length) {
        found = next.people[next.people.length - 1];
      }
      return { ok: true, person: found, directory: next };
    };
    M.bridge.removePerson = async function (match) {
      if (!global.People || typeof global.People.remove !== 'function') {
        return { ok: false, reason: 'people-unavailable' };
      }
      var current =
        typeof M.bridge.getPeople === 'function' ? M.bridge.getPeople() : null;
      var beforeCount =
        current && Array.isArray(current.people) ? current.people.length : 0;
      var next = global.People.remove(current, match || {});
      var afterCount =
        next && Array.isArray(next.people) ? next.people.length : 0;
      if (afterCount === beforeCount) {
        return { ok: false, reason: 'not-found' };
      }
      if (typeof M.options.applyPeople === 'function') {
        await Promise.resolve(M.options.applyPeople(next));
      } else if (M.t && typeof global.People.save === 'function') {
        next = await global.People.save(M.t, next);
      }
      return { ok: true, directory: next };
    };
    M.bridge.upsertPlace = async function (patch) {
      if (!global.Places || typeof global.Places.upsert !== 'function') {
        return { ok: false, reason: 'places-unavailable' };
      }
      var current =
        typeof M.bridge.getPlaces === 'function' ? M.bridge.getPlaces() : null;
      var next = global.Places.upsert(current, patch || {});
      if (typeof M.options.applyPlaces === 'function') {
        await Promise.resolve(M.options.applyPlaces(next));
      } else if (M.t && typeof global.Places.save === 'function') {
        next = await global.Places.save(M.t, next);
      }
      var found = null;
      if (patch && patch.name) {
        found = global.Places.findByAliasOrName(next, patch.name);
      } else if (patch && (patch.matchText || patch.id)) {
        found = global.Places.findByAliasOrName(
          next,
          patch.matchText || patch.id
        );
      }
      if (!found && next.places && next.places.length) {
        found = next.places[next.places.length - 1];
      }
      return { ok: true, place: found, directory: next };
    };
    M.bridge.removePlace = async function (match) {
      if (!global.Places || typeof global.Places.remove !== 'function') {
        return { ok: false, reason: 'places-unavailable' };
      }
      var current =
        typeof M.bridge.getPlaces === 'function' ? M.bridge.getPlaces() : null;
      var beforeCount =
        current && Array.isArray(current.places) ? current.places.length : 0;
      var next = global.Places.remove(current, match || {});
      var afterCount =
        next && Array.isArray(next.places) ? next.places.length : 0;
      if (afterCount === beforeCount) {
        return { ok: false, reason: 'not-found' };
      }
      if (typeof M.options.applyPlaces === 'function') {
        await Promise.resolve(M.options.applyPlaces(next));
      } else if (M.t && typeof global.Places.save === 'function') {
        next = await global.Places.save(M.t, next);
      }
      return { ok: true, directory: next };
    };
    }
  });
})(typeof window !== 'undefined' ? window : this);
