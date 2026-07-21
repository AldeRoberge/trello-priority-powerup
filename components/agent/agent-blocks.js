/**
 * Structured visual blocks for assistant chat turns.
 * Safe: all user/model strings go through textContent; no HTML from the model.
 */
(function (global) {
  'use strict';

  var BLOCK_TYPES = {
    priority: true,
    subtask: true,
    card_ref: true,
    due: true,
    statut: true,
    project: true,
    progress: true,
    diff: true,
    members: true,
    labels: true
  };

  var MAX_BLOCKS = 6;
  var PLACEHOLDER_RE = /\{\{(\d+)\}\}/g;

  function clampInt(v, min, max, fallback) {
    var n = Number(v);
    if (!isFinite(n)) return fallback;
    n = Math.round(n);
    if (n < min) return min;
    if (n > max) return max;
    return n;
  }

  function trimStr(v, maxLen) {
    if (typeof v !== 'string') return '';
    var s = v.trim();
    if (!s) return '';
    if (maxLen && s.length > maxLen) return s.slice(0, maxLen);
    return s;
  }

  function axisWord(key, value) {
    var PriorityUI = global.PriorityUI;
    if (PriorityUI && typeof PriorityUI.wordFor === 'function') {
      try {
        return PriorityUI.wordFor(key, value) || String(value);
      } catch (e) {
        /* ignore */
      }
    }
    return String(value);
  }

  function resolveTierLabel(block) {
    var tier = trimStr(block.tier, 40);
    if (tier) return tier;
    var PriorityUI = global.PriorityUI;
    if (
      PriorityUI &&
      typeof PriorityUI.baselineScore === 'function' &&
      typeof PriorityUI.tierFor === 'function' &&
      block.urgency != null &&
      block.impact != null &&
      block.ease != null
    ) {
      try {
        var score = PriorityUI.baselineScore(block.urgency, block.impact, block.ease);
        var t = PriorityUI.tierFor(score);
        if (t && t.label) return t.label;
      } catch (e) {
        /* ignore */
      }
    }
    return '';
  }

  function heatFromTier(tierLabel) {
    var map = {
      Critique: 4,
      Urgente: 4,
      Prioritaire: 3,
      Importante: 2,
      Flexible: 1,
      Secondaire: 1,
      Optionnelle: 0,
      Inutile: 0
    };
    return map[tierLabel] != null ? map[tierLabel] : 2;
  }

  function normalizePriorityBlock(raw) {
    var urgency = clampInt(raw.urgency, 0, 4, null);
    var impact = clampInt(raw.impact, 0, 4, null);
    var ease = clampInt(raw.ease, 1, 5, null);
    var tier = trimStr(raw.tier, 40);
    var out = { type: 'priority' };
    if (tier) out.tier = tier;
    if (urgency != null) out.urgency = urgency;
    if (impact != null) out.impact = impact;
    if (ease != null) out.ease = ease;
    if (raw.priorityEnabled === false) out.priorityEnabled = false;
    else if (raw.priorityEnabled === true) out.priorityEnabled = true;
    if (!out.tier && urgency == null && impact == null && ease == null) {
      return null;
    }
    if (!out.tier) out.tier = resolveTierLabel(out) || 'Priorité';
    return out;
  }

  function normalizeSubtaskBlock(raw) {
    var text = trimStr(raw.text || raw.title || raw.name, 160);
    if (!text) return null;
    var out = { type: 'subtask', text: text };
    if (raw.id != null) out.id = String(raw.id);
    if (raw.done != null) out.done = !!raw.done;
    if (raw.blocked != null) out.blocked = !!raw.blocked;
    if (raw.progress != null && isFinite(+raw.progress)) {
      out.progress = clampInt(raw.progress, 0, 100, 0);
    }
    if (raw.estimatedMinutes != null && isFinite(+raw.estimatedMinutes)) {
      out.estimatedMinutes = Math.max(0, Math.round(+raw.estimatedMinutes));
    }
    if (raw.removed === true) out.removed = true;
    return out;
  }

  function normalizeCardRefBlock(raw, context) {
    var boardCards =
      context && Array.isArray(context.boardCards) ? context.boardCards : [];
    var idx =
      raw.cardIndex != null
        ? clampInt(raw.cardIndex, 0, Math.max(0, boardCards.length - 1), null)
        : null;
    var card = null;
    if (idx != null && boardCards[idx]) card = boardCards[idx];
    else if (raw.cardId != null) {
      var want = String(raw.cardId);
      for (var i = 0; i < boardCards.length; i++) {
        if (boardCards[i] && String(boardCards[i].id) === want) {
          card = boardCards[i];
          idx = i;
          break;
        }
      }
    }
    var name =
      trimStr(raw.name, 120) ||
      (card && trimStr(card.name, 120)) ||
      '';
    if (!name && !card) return null;
    var fields = Array.isArray(raw.fields)
      ? raw.fields
          .map(function (f) {
            return trimStr(f, 32);
          })
          .filter(Boolean)
          .slice(0, 6)
      : ['name', 'list', 'due', 'priority'];
    var out = {
      type: 'card_ref',
      name: name || (card && card.name) || 'Carte',
      fields: fields
    };
    if (idx != null) out.cardIndex = idx;
    if (card && card.id != null) out.cardId = String(card.id);
    if (card && card.list) out.list = trimStr(card.list, 80);
    else if (raw.list) out.list = trimStr(raw.list, 80);
    if (raw.due) out.due = trimStr(String(raw.due), 40);
    else if (card && card.due) out.due = trimStr(String(card.due), 40);
    if (raw.priority) out.priority = trimStr(String(raw.priority), 40);
    else if (card && (card.priority || card.tier)) {
      out.priority = trimStr(String(card.priority || card.tier), 40);
    }
    if (raw.progress != null && isFinite(+raw.progress)) {
      out.progress = clampInt(raw.progress, 0, 100, null);
    } else if (card && card.progress != null && isFinite(+card.progress)) {
      out.progress = clampInt(card.progress, 0, 100, null);
    }
    return out;
  }

  function normalizeDueBlock(raw) {
    var out = { type: 'due' };
    var dueDate = trimStr(raw.dueDate || raw.date, 32);
    var dueTime = trimStr(raw.dueTime || raw.time, 16);
    var dueVague = trimStr(raw.dueVague || raw.vague, 40);
    var dueMode = trimStr(raw.dueMode || raw.mode, 16);
    if (raw.dueEnabled === false || raw.clear === true) {
      out.cleared = true;
      return out;
    }
    if (dueVague) {
      out.dueVague = dueVague;
      out.dueMode = 'vague';
    } else if (dueDate || dueTime) {
      if (dueDate) out.dueDate = dueDate;
      if (dueTime) out.dueTime = dueTime;
      out.dueMode = dueMode === 'vague' ? 'vague' : 'precise';
    } else if (raw.label) {
      out.label = trimStr(raw.label, 80);
    } else {
      return null;
    }
    if (raw.recurrence && typeof raw.recurrence === 'object') {
      var freq = trimStr(raw.recurrence.frequency || raw.recurrence.freq, 20);
      if (freq) out.recurrence = { frequency: freq };
    }
    if (raw.startDate) out.startDate = trimStr(raw.startDate, 32);
    return out;
  }

  function normalizeStatutBlock(raw) {
    var listName = trimStr(raw.listName || raw.list || raw.name, 80);
    var category = trimStr(raw.category, 40);
    if (!listName && !category) return null;
    var out = { type: 'statut' };
    if (listName) out.listName = listName;
    if (category) out.category = category;
    if (raw.listId != null) out.listId = String(raw.listId);
    return out;
  }

  function normalizeProjectBlock(raw) {
    if (raw.clear === true || raw.cleared === true) {
      return { type: 'project', cleared: true };
    }
    var name = trimStr(raw.name || raw.projectName, 80);
    if (!name && raw.projectId == null) return null;
    var out = { type: 'project' };
    if (name) out.name = name;
    if (raw.projectId != null) out.projectId = String(raw.projectId);
    return out;
  }

  function normalizeProgressBlock(raw) {
    var progress =
      raw.progress != null && isFinite(+raw.progress)
        ? clampInt(raw.progress, 0, 100, null)
        : null;
    var out = { type: 'progress' };
    if (progress != null) out.progress = progress;
    if (raw.progressEnabled === false) out.progressEnabled = false;
    if (raw.estimatedMinutes != null && isFinite(+raw.estimatedMinutes)) {
      out.estimatedMinutes = Math.max(0, Math.round(+raw.estimatedMinutes));
    }
    if (typeof raw.itemText === 'string' && raw.itemText.trim()) {
      out.itemText = trimStr(raw.itemText, 120);
    }
    if (raw.doneCount != null && isFinite(+raw.doneCount)) {
      out.doneCount = Math.max(0, Math.round(+raw.doneCount));
    }
    if (raw.totalCount != null && isFinite(+raw.totalCount)) {
      out.totalCount = Math.max(0, Math.round(+raw.totalCount));
    }
    if (
      progress == null &&
      out.estimatedMinutes == null &&
      !out.itemText &&
      out.doneCount == null
    ) {
      return null;
    }
    return out;
  }

  function normalizeDiffBlock(raw) {
    var rows = [];
    var src = Array.isArray(raw.rows) ? raw.rows : Array.isArray(raw.changes) ? raw.changes : [];
    src.forEach(function (row) {
      if (!row || typeof row !== 'object') return;
      var label = trimStr(row.label || row.key || row.field, 60);
      var before = row.before != null ? trimStr(String(row.before), 80) : '';
      var after = row.after != null ? trimStr(String(row.after), 80) : '';
      if (!label && !before && !after) return;
      rows.push({
        label: label || 'Changement',
        before: before,
        after: after
      });
    });
    if (!rows.length) return null;
    return { type: 'diff', rows: rows.slice(0, 8) };
  }

  function normalizePeopleBlock(type, raw) {
    var people = [];
    var src = Array.isArray(raw.people)
      ? raw.people
      : Array.isArray(raw.members)
        ? raw.members
        : Array.isArray(raw.items)
          ? raw.items
          : [];
    src.forEach(function (p) {
      if (typeof p === 'string') {
        var s = trimStr(p, 60);
        if (s) people.push({ name: s });
        return;
      }
      if (!p || typeof p !== 'object') return;
      var name = trimStr(p.name || p.fullName || p.username || p.label, 60);
      if (!name) return;
      var entry = { name: name };
      if (p.op === 'add' || p.op === 'remove') entry.op = p.op;
      if (p.color) entry.color = trimStr(String(p.color), 24);
      people.push(entry);
    });
    if (typeof raw.ops === 'string' && raw.ops.trim()) {
      raw.ops.split(/[;,]/).forEach(function (part) {
        var t = part.trim();
        if (!t) return;
        var op = t.charAt(0) === '+' ? 'add' : t.charAt(0) === '−' || t.charAt(0) === '-' ? 'remove' : null;
        var name = op ? t.slice(1).trim() : t;
        if (name) people.push(op ? { name: name, op: op } : { name: name });
      });
    }
    if (!people.length && Array.isArray(raw.added)) {
      raw.added.forEach(function (n) {
        var name = trimStr(typeof n === 'string' ? n : n && n.name, 60);
        if (name) people.push({ name: name, op: 'add' });
      });
    }
    if (!people.length && Array.isArray(raw.removed)) {
      raw.removed.forEach(function (n) {
        var name = trimStr(typeof n === 'string' ? n : n && n.name, 60);
        if (name) people.push({ name: name, op: 'remove' });
      });
    }
    if (!people.length) return null;
    return { type: type, people: people.slice(0, 12) };
  }

  function normalizeLabelsBlock(raw) {
    var labels = [];
    var src = Array.isArray(raw.labels)
      ? raw.labels
      : Array.isArray(raw.items)
        ? raw.items
        : [];
    src.forEach(function (lab) {
      if (typeof lab === 'string') {
        var s = trimStr(lab, 40);
        if (s) labels.push({ name: s });
        return;
      }
      if (!lab || typeof lab !== 'object') return;
      var name = trimStr(lab.name || lab.label, 40);
      if (!name) return;
      var entry = { name: name };
      if (lab.color) entry.color = trimStr(String(lab.color), 24);
      if (lab.op === 'add' || lab.op === 'remove') entry.op = lab.op;
      labels.push(entry);
    });
    if (!labels.length && typeof raw.ops === 'string' && raw.ops.trim()) {
      raw.ops.split(/[;,]/).forEach(function (part) {
        var t = part.trim();
        if (!t) return;
        var op =
          t.charAt(0) === '+'
            ? 'add'
            : t.charAt(0) === '−' || t.charAt(0) === '-'
              ? 'remove'
              : null;
        var name = op ? t.slice(1).trim() : t;
        if (name) labels.push(op ? { name: name, op: op } : { name: name });
      });
    }
    if (!labels.length) return null;
    return { type: 'labels', labels: labels.slice(0, 12) };
  }

  function normalizeOneBlock(raw, context) {
    if (!raw || typeof raw !== 'object') return null;
    var type = typeof raw.type === 'string' ? raw.type.trim() : '';
    if (!BLOCK_TYPES[type]) return null;
    if (type === 'priority') return normalizePriorityBlock(raw);
    if (type === 'subtask') return normalizeSubtaskBlock(raw);
    if (type === 'card_ref') return normalizeCardRefBlock(raw, context);
    if (type === 'due') return normalizeDueBlock(raw);
    if (type === 'statut') return normalizeStatutBlock(raw);
    if (type === 'project') return normalizeProjectBlock(raw);
    if (type === 'progress') return normalizeProgressBlock(raw);
    if (type === 'diff') return normalizeDiffBlock(raw);
    if (type === 'members') return normalizePeopleBlock('members', raw);
    if (type === 'labels') return normalizeLabelsBlock(raw);
    return null;
  }

  /**
   * Normalize model-emitted blocks. Cap at MAX_BLOCKS. Invalid entries dropped.
   */
  function normalizeBlocks(raw, context) {
    var out = [];
    if (!Array.isArray(raw)) return out;
    raw.forEach(function (b) {
      if (out.length >= MAX_BLOCKS) return;
      var n = normalizeOneBlock(b, context);
      if (n) out.push(n);
    });
    return out;
  }

  function blockDedupeKey(block) {
    if (!block || !block.type) return '';
    if (block.type === 'priority') return 'priority';
    if (block.type === 'due') return 'due';
    if (block.type === 'statut') return 'statut:' + (block.listId || block.listName || '');
    if (block.type === 'project') return 'project:' + (block.projectId || block.name || 'x');
    if (block.type === 'progress') return 'progress';
    if (block.type === 'subtask') {
      return 'subtask:' + (block.id || block.text || '');
    }
    if (block.type === 'card_ref') {
      return 'card:' + (block.cardId || block.cardIndex || block.name || '');
    }
    if (block.type === 'members') return 'members';
    if (block.type === 'labels') return 'labels';
    if (block.type === 'diff') return 'diff:' + (block.rows && block.rows[0] && block.rows[0].label);
    return block.type;
  }

  /**
   * Build user-facing blocks from executeActions results (uses result.visual).
   */
  function synthesizeBlocksFromResults(applied, context) {
    var results =
      applied && Array.isArray(applied.results) ? applied.results : [];
    var out = [];
    var seen = {};
    results.forEach(function (r) {
      if (!r || !r.ok || !r.visual) return;
      var blocks = [];
      var visual = r.visual;
      if (visual.type === 'diff' || (visual.rows && !visual.type)) {
        var d = normalizeDiffBlock(visual);
        if (d) blocks.push(d);
      } else {
        var main = normalizeOneBlock(visual, context);
        if (main) blocks.push(main);
      }
      if (Array.isArray(visual.diffRows) && visual.diffRows.length) {
        var d2 = normalizeDiffBlock({ rows: visual.diffRows });
        if (d2) blocks.push(d2);
      }
      blocks.forEach(function (b) {
        var key = blockDedupeKey(b);
        if (key && seen[key]) return;
        if (key) seen[key] = true;
        if (out.length < MAX_BLOCKS) out.push(b);
      });
    });
    return out;
  }

  /** Hide trailing unfinished {{n during streaming. */
  function hideIncompleteBlockMarker(text) {
    if (typeof text !== 'string' || !text) return text || '';
    var lastOpen = text.lastIndexOf('{{');
    if (lastOpen === -1) {
      if (text.charAt(text.length - 1) === '{') return text.slice(0, -1);
      return text;
    }
    var after = text.slice(lastOpen);
    if (/^\{\{\d+\}\}/.test(after)) return text;
    if (after === '{{' || /^\{\{\d*$/.test(after) || /^\{\{\d+\}?$/.test(after)) {
      return text.slice(0, lastOpen);
    }
    return text;
  }

  /**
   * Drop leading indent before {{n}} markers so pre-wrap bubbles do not
   * push block cards inward when the model indents placeholders.
   */
  function normalizeBlockPlaceholderIndent(text) {
    if (typeof text !== 'string' || !text) return text || '';
    return text.replace(/^[ \t]+(\{\{\d+\}\})/gm, '$1');
  }

  /** Trailing spaces/tabs before a block (keep newlines). */
  function trimTrailingIndent(chunk) {
    if (typeof chunk !== 'string' || !chunk) return chunk || '';
    return chunk.replace(/[ \t]+$/g, '');
  }

  /** Leading spaces/tabs after a block (keep newlines). */
  function trimLeadingIndent(chunk) {
    if (typeof chunk !== 'string' || !chunk) return chunk || '';
    return chunk.replace(/^[ \t]+/, '').replace(/^(\n+)[ \t]+/, '$1');
  }

  function formatMinutes(mins) {
    if (mins == null || !isFinite(+mins) || +mins <= 0) return '';
    var m = Math.round(+mins);
    if (m < 60) return m + ' min';
    var h = Math.floor(m / 60);
    var rem = m % 60;
    if (!rem) return h + ' h';
    return h + ' h ' + rem + ' min';
  }

  function el(tag, className, attrs) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else node.setAttribute(k, attrs[k]);
      });
    }
    return node;
  }

  function renderPriorityBlock(block) {
    var card = el('div', 'agent-block agent-block--priority');
    var enabled = block.priorityEnabled !== false;
    var tier = resolveTierLabel(block) || 'Priorité';
    var heat = heatFromTier(tier);
    card.setAttribute('data-heat', String(heat));
    var badge = el('div', 'agent-block-priority-badge agent-block-priority-badge--heat-' + heat);
    badge.textContent = enabled ? tier : 'Priorité désactivée';
    card.appendChild(badge);
    if (enabled) {
      var strip = el('div', 'agent-block-heat-strip');
      for (var h = 0; h <= 4; h++) {
        var seg = el(
          'span',
          'agent-block-heat-seg' + (h === heat ? ' is-active' : '')
        );
        seg.setAttribute('data-heat', String(h));
        strip.appendChild(seg);
      }
      card.appendChild(strip);
      var axes = el('div', 'agent-block-axes');
      if (block.urgency != null) {
        axes.appendChild(
          el('span', 'agent-block-axis-chip', {
            text: 'Urgence · ' + axisWord('urgency', block.urgency)
          })
        );
      }
      if (block.impact != null) {
        axes.appendChild(
          el('span', 'agent-block-axis-chip', {
            text: 'Impact · ' + axisWord('impact', block.impact)
          })
        );
      }
      if (block.ease != null) {
        axes.appendChild(
          el('span', 'agent-block-axis-chip', {
            text: 'Facilité · ' + axisWord('ease', block.ease)
          })
        );
      }
      if (axes.childNodes.length) card.appendChild(axes);
    }
    return card;
  }

  function renderSubtaskBlock(block) {
    var card = el(
      'div',
      'agent-block agent-block--subtask' +
        (block.done ? ' is-done' : '') +
        (block.blocked ? ' is-blocked' : '') +
        (block.removed ? ' is-removed' : '')
    );
    var row = el('div', 'agent-block-subtask-row');
    var mark = el('span', 'agent-block-subtask-mark', {
      'aria-hidden': 'true'
    });
    mark.textContent = block.removed
      ? '×'
      : block.done
        ? '✓'
        : block.blocked
          ? '⊘'
          : '○';
    row.appendChild(mark);
    var title = el('span', 'agent-block-subtask-title', { text: block.text });
    row.appendChild(title);
    card.appendChild(row);
    var meta = el('div', 'agent-block-meta');
    if (block.blocked) {
      meta.appendChild(el('span', 'agent-block-pill agent-block-pill--warn', { text: 'Bloquée' }));
    }
    if (block.progress != null && !block.done) {
      meta.appendChild(
        el('span', 'agent-block-pill', { text: block.progress + ' %' })
      );
    }
    var est = formatMinutes(block.estimatedMinutes);
    if (est) {
      meta.appendChild(el('span', 'agent-block-pill', { text: est }));
    }
    if (meta.childNodes.length) card.appendChild(meta);
    return card;
  }

  function renderCardRefBlock(block) {
    var card = el('div', 'agent-block agent-block--card-ref');
    var title = el('div', 'agent-block-card-title', { text: block.name });
    card.appendChild(title);
    var fields = Array.isArray(block.fields) ? block.fields : [];
    var meta = el('div', 'agent-block-meta');
    function want(f) {
      return !fields.length || fields.indexOf(f) >= 0;
    }
    if (want('list') && block.list) {
      meta.appendChild(el('span', 'agent-block-pill', { text: block.list }));
    }
    if (want('due') && block.due) {
      meta.appendChild(el('span', 'agent-block-pill', { text: block.due }));
    }
    if (want('priority') && block.priority) {
      meta.appendChild(
        el('span', 'agent-block-pill agent-block-pill--accent', {
          text: block.priority
        })
      );
    }
    if (want('progress') && block.progress != null) {
      meta.appendChild(
        el('span', 'agent-block-pill', { text: block.progress + ' %' })
      );
    }
    if (meta.childNodes.length) card.appendChild(meta);
    return card;
  }

  function renderDueBlock(block) {
    var card = el('div', 'agent-block agent-block--due');
    var label = el('div', 'agent-block-label', { text: 'Échéance' });
    card.appendChild(label);
    var value = el('div', 'agent-block-due-value');
    if (block.cleared) {
      value.textContent = 'Aucune';
      card.classList.add('is-cleared');
    } else if (block.dueVague) {
      value.textContent = block.dueVague;
    } else if (block.label) {
      value.textContent = block.label;
    } else {
      var parts = [];
      if (block.dueDate) parts.push(block.dueDate);
      if (block.dueTime) parts.push(block.dueTime);
      value.textContent = parts.join(' · ') || '—';
    }
    card.appendChild(value);
    if (block.recurrence && block.recurrence.frequency) {
      card.appendChild(
        el('div', 'agent-block-meta', {
          text: 'Récurrence · ' + block.recurrence.frequency
        })
      );
    }
    return card;
  }

  function renderStatutBlock(block) {
    var card = el('div', 'agent-block agent-block--statut');
    var StatutMatch = global.StatutMatch;
    var style =
      StatutMatch && typeof StatutMatch.categoryStyle === 'function'
        ? StatutMatch.categoryStyle(block.category || '_none')
        : { color: '#626f86' };
    var catLabel =
      StatutMatch && typeof StatutMatch.categoryLabel === 'function' && block.category
        ? StatutMatch.categoryLabel(block.category)
        : block.category || '';
    var swatch = el('span', 'agent-block-statut-swatch');
    swatch.style.background = style.color || '#626f86';
    card.appendChild(swatch);
    var body = el('div', 'agent-block-statut-body');
    body.appendChild(
      el('div', 'agent-block-statut-list', {
        text: block.listName || catLabel || 'Statut'
      })
    );
    if (catLabel && block.listName) {
      body.appendChild(
        el('div', 'agent-block-meta', { text: catLabel })
      );
    }
    card.appendChild(body);
    return card;
  }

  function renderProjectBlock(block) {
    var card = el('div', 'agent-block agent-block--project');
    card.appendChild(el('div', 'agent-block-label', { text: 'Projet' }));
    card.appendChild(
      el('div', 'agent-block-project-name', {
        text: block.cleared ? 'Aucun' : block.name || 'Projet'
      })
    );
    if (block.cleared) card.classList.add('is-cleared');
    return card;
  }

  function renderProgressBlock(block) {
    var card = el('div', 'agent-block agent-block--progress');
    var pct = block.progress != null ? block.progress : null;
    var head = el('div', 'agent-block-progress-head');
    head.appendChild(el('span', 'agent-block-label', { text: 'Progrès' }));
    if (pct != null) {
      head.appendChild(el('span', 'agent-block-progress-pct', { text: pct + ' %' }));
    }
    card.appendChild(head);
    if (pct != null) {
      var track = el('div', 'agent-block-progress-track');
      var fill = el('div', 'agent-block-progress-fill');
      fill.style.width = pct + '%';
      track.appendChild(fill);
      card.appendChild(track);
    }
    var meta = el('div', 'agent-block-meta');
    if (block.doneCount != null && block.totalCount != null) {
      meta.appendChild(
        el('span', 'agent-block-pill', {
          text: block.doneCount + ' / ' + block.totalCount
        })
      );
    }
    var est = formatMinutes(block.estimatedMinutes);
    if (est) meta.appendChild(el('span', 'agent-block-pill', { text: est }));
    if (block.itemText) {
      meta.appendChild(
        el('span', 'agent-block-pill', { text: block.itemText })
      );
    }
    if (meta.childNodes.length) card.appendChild(meta);
    return card;
  }

  function renderDiffBlock(block) {
    var card = el('div', 'agent-block agent-block--diff');
    card.appendChild(el('div', 'agent-block-label', { text: 'Changements' }));
    var list = el('div', 'agent-block-diff-rows');
    (block.rows || []).forEach(function (row) {
      var rowEl = el('div', 'agent-block-diff-row');
      rowEl.appendChild(
        el('span', 'agent-block-diff-label', { text: row.label })
      );
      var change = el('span', 'agent-block-diff-change');
      if (row.before) {
        change.appendChild(
          el('span', 'agent-block-diff-before', { text: row.before })
        );
        change.appendChild(document.createTextNode(' → '));
      }
      change.appendChild(
        el('span', 'agent-block-diff-after', { text: row.after || '—' })
      );
      rowEl.appendChild(change);
      list.appendChild(rowEl);
    });
    card.appendChild(list);
    return card;
  }

  function renderPeopleBlock(block) {
    var card = el('div', 'agent-block agent-block--members');
    card.appendChild(
      el('div', 'agent-block-label', {
        text: block.type === 'labels' ? 'Étiquettes' : 'Personnes'
      })
    );
    var row = el('div', 'agent-block-chip-row');
    var items =
      block.type === 'labels' ? block.labels || [] : block.people || [];
    items.forEach(function (p) {
      var chip = el(
        'span',
        'agent-block-person-chip' +
          (p.op === 'add' ? ' is-add' : '') +
          (p.op === 'remove' ? ' is-remove' : '')
      );
      chip.textContent =
        (p.op === 'add' ? '+ ' : p.op === 'remove' ? '− ' : '') + p.name;
      if (p.color) {
        chip.style.borderColor = p.color;
        chip.style.background = 'color-mix(in srgb, ' + p.color + ' 18%, transparent)';
      }
      row.appendChild(chip);
    });
    card.appendChild(row);
    return card;
  }

  function renderBlock(block) {
    if (!block || !block.type) return null;
    try {
      if (block.type === 'priority') return renderPriorityBlock(block);
      if (block.type === 'subtask') return renderSubtaskBlock(block);
      if (block.type === 'card_ref') return renderCardRefBlock(block);
      if (block.type === 'due') return renderDueBlock(block);
      if (block.type === 'statut') return renderStatutBlock(block);
      if (block.type === 'project') return renderProjectBlock(block);
      if (block.type === 'progress') return renderProgressBlock(block);
      if (block.type === 'diff') return renderDiffBlock(block);
      if (block.type === 'members' || block.type === 'labels') {
        return renderPeopleBlock(block);
      }
    } catch (e) {
      console.error('AgentBlocks.renderBlock failed', e);
    }
    return null;
  }

  /**
   * Fill a bubble with highlighted text + optional {{n}} block placeholders.
   * highlightFns: { normalize, hideIncomplete, stripLeftover, appendHighlighted }
   * When streaming (options.streaming), placeholders are hidden / not resolved.
   */
  function fillMessageContent(bubble, text, blocks, options) {
    options = options || {};
    if (!bubble) return;
    bubble.replaceChildren();
    var raw = typeof text === 'string' ? text : '';
    var list = Array.isArray(blocks) ? blocks : [];
    var streaming = !!options.streaming;
    var highlight = options.highlight || {};

    var display = raw;
    if (typeof highlight.normalize === 'function') {
      display = highlight.normalize(display);
    }
    if (streaming) {
      if (typeof highlight.hideIncomplete === 'function') {
        display = highlight.hideIncomplete(display);
      }
      display = hideIncompleteBlockMarker(display);
    }
    display = normalizeBlockPlaceholderIndent(display);

    if (!display && !list.length) return;

    var used = {};
    var re = PLACEHOLDER_RE;
    re.lastIndex = 0;
    var last = 0;
    var m;
    var hasPlaceholder = false;
    var pendingAfterBlock = false;

    function appendTextChunk(chunk) {
      if (!chunk) return;
      if (pendingAfterBlock) {
        chunk = trimLeadingIndent(chunk);
        pendingAfterBlock = false;
      }
      if (!chunk) return;
      if (typeof highlight.appendHighlighted === 'function') {
        highlight.appendHighlighted(bubble, chunk);
      } else {
        bubble.appendChild(document.createTextNode(chunk));
      }
    }

    while ((m = re.exec(display)) !== null) {
      hasPlaceholder = true;
      if (m.index > last) {
        appendTextChunk(trimTrailingIndent(display.slice(last, m.index)));
      }
      var idx = parseInt(m[1], 10);
      if (
        !streaming &&
        isFinite(idx) &&
        idx >= 0 &&
        idx < list.length &&
        list[idx]
      ) {
        var node = renderBlock(list[idx]);
        if (node) {
          bubble.appendChild(node);
          used[idx] = true;
          pendingAfterBlock = true;
        } else {
          appendTextChunk(m[0]);
        }
      } else if (streaming) {
        /* skip unresolved placeholder while streaming */
      } else {
        appendTextChunk(m[0]);
      }
      last = m.index + m[0].length;
    }

    if (!hasPlaceholder) {
      appendTextChunk(display);
    } else if (last < display.length) {
      appendTextChunk(display.slice(last));
    }

    if (!streaming && list.length) {
      for (var i = 0; i < list.length; i++) {
        if (used[i]) continue;
        var orphan = renderBlock(list[i]);
        if (orphan) bubble.appendChild(orphan);
      }
    }
  }

  /**
   * Append auto-synthesized result cards after the bubble (same assistant row).
   */
  function appendResultBlocks(hostRow, blocks, options) {
    options = options || {};
    if (!hostRow || !Array.isArray(blocks) || !blocks.length) return null;
    var existing = hostRow.querySelector('.agent-result-blocks');
    if (existing) existing.remove();
    var wrap = el('div', 'agent-result-blocks');
    blocks.forEach(function (b) {
      var node = renderBlock(b);
      if (node) {
        node.classList.add('agent-block--result');
        wrap.appendChild(node);
      }
    });
    if (!wrap.childNodes.length) return null;
    var bubble = hostRow.querySelector('.agent-msg-bubble');
    var verify = hostRow.querySelector('.agent-tool-verify');
    if (verify && verify.parentNode === hostRow) {
      hostRow.insertBefore(wrap, verify);
    } else if (bubble && bubble.nextSibling) {
      hostRow.insertBefore(wrap, bubble.nextSibling);
    } else {
      hostRow.appendChild(wrap);
    }
    return wrap;
  }

  global.AgentBlocks = {
    BLOCK_TYPES: BLOCK_TYPES,
    MAX_BLOCKS: MAX_BLOCKS,
    normalizeBlocks: normalizeBlocks,
    synthesizeBlocksFromResults: synthesizeBlocksFromResults,
    hideIncompleteBlockMarker: hideIncompleteBlockMarker,
    normalizeBlockPlaceholderIndent: normalizeBlockPlaceholderIndent,
    fillMessageContent: fillMessageContent,
    renderBlock: renderBlock,
    appendResultBlocks: appendResultBlocks,
    formatMinutes: formatMinutes,
    resolveTierLabel: resolveTierLabel
  };
})(typeof window !== 'undefined' ? window : this);
