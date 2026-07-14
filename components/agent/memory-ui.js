/**
 * Compact conversational UI for AI memory alignment (modal + board bar).
 * Exposes window.MemoryUI.mount(container, options).
 */
(function (global) {
  'use strict';

  var HOLE_RE = /(\u2026|\.{3,}|\[([^\]]*)\])/g;

  function el(tag, className, attrs) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        if (key === 'text') node.textContent = attrs[key];
        else if (key === 'html') node.innerHTML = attrs[key];
        else node.setAttribute(key, attrs[key]);
      });
    }
    return node;
  }

  function normalizeMatch(s) {
    return String(s || '')
      .toLocaleLowerCase('fr-FR')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function isPlaceholderText(text, placeholder) {
    var t = String(text || '')
      .replace(/\u200b/g, '')
      .trim();
    if (!t) return true;
    if (t === '...' || t === '\u2026') return true;
    if (placeholder && t === String(placeholder).trim()) return true;
    return false;
  }

  /**
   * Split a suggestion into text / fillable hole segments.
   * Holes: …, ..., or [label]
   */
  function parseTemplate(raw) {
    var text = String(raw || '');
    var segments = [];
    var last = 0;
    var m;
    HOLE_RE.lastIndex = 0;
    while ((m = HOLE_RE.exec(text))) {
      if (m.index > last) {
        segments.push({ type: 'text', value: text.slice(last, m.index) });
      }
      segments.push({
        type: 'hole',
        label: (m[2] && m[2].trim()) || '\u2026'
      });
      last = m.index + m[0].length;
    }
    if (last < text.length) {
      segments.push({ type: 'text', value: text.slice(last) });
    }
    if (!segments.length) {
      segments.push({ type: 'text', value: text });
    }
    return segments;
  }

  function plainSuggestion(raw) {
    return parseTemplate(raw)
      .map(function (seg) {
        return seg.type === 'hole' ? seg.label || '\u2026' : seg.value;
      })
      .join('');
  }

  function prefixBeforeHole(raw) {
    var segments = parseTemplate(raw);
    var out = '';
    for (var i = 0; i < segments.length; i++) {
      if (segments[i].type === 'hole') break;
      out += segments[i].value;
    }
    return out;
  }

  /**
   * options: {
   *   t, mode: 'onboarding'|'ongoing',
   *   onLayoutChange, onComplete, onSkip,
   *   showSkip: boolean, showSummary: boolean
   * }
   */
  function mount(containerEl, options) {
    if (!containerEl) throw new Error('MemoryUI.mount: container required');
    options = options || {};
    var t = options.t;
    var mode = options.mode === 'onboarding' ? 'onboarding' : 'ongoing';
    var onLayoutChange =
      typeof options.onLayoutChange === 'function' ? options.onLayoutChange : function () {};
    var onComplete =
      typeof options.onComplete === 'function' ? options.onComplete : null;
    var onSkip = typeof options.onSkip === 'function' ? options.onSkip : null;
    var Agent = global.PriorityAgent;
    var Mem = global.AgentMemory;
    if (!Agent || !Mem) throw new Error('PriorityAgent and AgentMemory required');

    var provider = Agent.normalizeProvider(null);
    var memory = Mem.emptyMemory();
    var history = [];
    var pending = false;
    var boardDigest = '';
    var answeredCount = 0;
    var TARGET_ANSWERS = 4;
    var allSuggestions = [];
    var tabTarget = '';

    containerEl.innerHTML = '';
    containerEl.classList.add('memory-ui');

    var header = el('div', 'memory-ui-header');
    var title = el('h2', 'memory-ui-title', {
      text: mode === 'onboarding' ? 'Aligner l\'assistant' : 'M\u00e9moire de l\'assistant'
    });
    var subtitle = el('p', 'memory-ui-subtitle', {
      text:
        mode === 'onboarding'
          ? 'Quelques questions pour mieux cadrer tes cartes et suggestions.'
          : 'Ajoute ou corrige les faits importants (bas du tableau).'
    });
    header.appendChild(title);
    header.appendChild(subtitle);
    containerEl.appendChild(header);

    var progressEl = el('div', 'memory-ui-progress', {
      role: 'progressbar',
      'aria-valuemin': '0',
      'aria-valuemax': String(TARGET_ANSWERS),
      'aria-valuenow': '0',
      'aria-label': 'Progression de l\'alignement'
    });
    progressEl.hidden = mode !== 'onboarding';
    var progressHead = el('div', 'memory-ui-progress-head');
    var progressCaption = el('span', 'memory-ui-progress-caption', {
      text: 'Progression'
    });
    var progressCount = el('span', 'memory-ui-progress-count');
    progressHead.appendChild(progressCaption);
    progressHead.appendChild(progressCount);
    var progressTrack = el('div', 'memory-ui-progress-track');
    var progressFill = el('div', 'memory-ui-progress-fill');
    progressTrack.appendChild(progressFill);
    progressEl.appendChild(progressHead);
    progressEl.appendChild(progressTrack);
    containerEl.appendChild(progressEl);

    var summaryEl = el('div', 'memory-ui-summary');
    summaryEl.hidden = options.showSummary === false;
    containerEl.appendChild(summaryEl);

    var messagesEl = el('div', 'memory-ui-messages');
    containerEl.appendChild(messagesEl);

    var suggestionsEl = el('div', 'memory-ui-suggestions');
    suggestionsEl.hidden = true;
    containerEl.appendChild(suggestionsEl);

    var errorEl = el('p', 'memory-ui-error');
    errorEl.hidden = true;
    containerEl.appendChild(errorEl);

    var composer = el('div', 'memory-ui-composer');
    var inputWrap = el('div', 'memory-ui-input-wrap');
    var ghostEl = el('div', 'memory-ui-input-ghost', { 'aria-hidden': 'true' });
    var input = el('div', 'memory-ui-input is-empty', {
      role: 'textbox',
      contenteditable: 'true',
      'aria-multiline': 'true',
      'aria-label': 'Message',
      'data-placeholder': 'Votre r\u00e9ponse\u2026',
      spellcheck: 'true'
    });
    inputWrap.appendChild(ghostEl);
    inputWrap.appendChild(input);
    var sendBtn = el('button', 'tp-btn tp-btn--primary memory-ui-send', {
      type: 'button',
      text: 'Envoyer'
    });
    composer.appendChild(inputWrap);
    composer.appendChild(sendBtn);
    containerEl.appendChild(composer);

    var footer = el('div', 'memory-ui-footer');
    if (options.showSkip !== false && mode === 'onboarding') {
      var skipBtn = el('button', 'tp-btn memory-ui-skip', {
        type: 'button',
        text: 'Plus tard'
      });
      skipBtn.addEventListener('click', function () {
        if (onSkip) onSkip(memory);
      });
      footer.appendChild(skipBtn);
    }
    var doneBtn = el('button', 'tp-btn tp-btn--primary memory-ui-done', {
      type: 'button',
      text: mode === 'onboarding' ? 'Continuer' : 'Fermer'
    });
    doneBtn.addEventListener('click', function () {
      finish(true);
    });
    footer.appendChild(doneBtn);
    containerEl.appendChild(footer);

    updateProgress();

    function setError(msg) {
      if (!msg) {
        errorEl.hidden = true;
        errorEl.textContent = '';
        return;
      }
      errorEl.hidden = false;
      errorEl.textContent = msg;
      onLayoutChange();
    }

    function memoryView() {
      if (Mem && typeof Mem.legacyView === 'function') return Mem.legacyView(memory);
      return {
        summary: memory.summary || '',
        facts: memory.facts || [],
        boardSummary: (memory.shortTerm && memory.shortTerm.boardSummary) || '',
        shortNotes: (memory.shortTerm && memory.shortTerm.notes) || []
      };
    }

    function updateProgress() {
      if (progressEl.hidden) return;
      var view = memoryView();
      var fromAnswers = answeredCount;
      var fromFacts = view.facts ? view.facts.length : 0;
      var current = Math.max(fromAnswers, Math.min(fromFacts, TARGET_ANSWERS));
      if (memory && memory.onboardingComplete) {
        current = TARGET_ANSWERS;
      }
      current = Math.max(0, Math.min(TARGET_ANSWERS, current));
      var pct = Math.round((current / TARGET_ANSWERS) * 100);
      progressFill.style.width = pct + '%';
      progressCount.textContent = current + ' / ' + TARGET_ANSWERS;
      progressEl.setAttribute('aria-valuenow', String(current));
      progressEl.setAttribute(
        'aria-valuetext',
        current + ' r\u00e9ponse' + (current === 1 ? '' : 's') + ' sur ' + TARGET_ANSWERS
      );
    }

    function renderSummary() {
      if (summaryEl.hidden) return;
      summaryEl.replaceChildren();
      var view = memoryView();

      var ltLabel = el('div', 'memory-ui-summary-label', {
        text: 'M\u00e9moire long terme'
      });
      summaryEl.appendChild(ltLabel);
      if (view.summary) {
        summaryEl.appendChild(el('p', 'memory-ui-summary-text', { text: view.summary }));
      }
      if (view.facts && view.facts.length) {
        var ul = el('ul', 'memory-ui-facts');
        view.facts.slice(0, 8).forEach(function (f) {
          ul.appendChild(
            el('li', null, { text: typeof f === 'string' ? f : f.text || '' })
          );
        });
        summaryEl.appendChild(ul);
      } else if (!view.summary) {
        summaryEl.appendChild(
          el('p', 'memory-ui-summary-empty', {
            text: 'Aucun fait durable pour l\'instant (nom, r\u00f4le, focus\u2026).'
          })
        );
      }

      if (view.boardSummary || (view.shortNotes && view.shortNotes.length)) {
        summaryEl.appendChild(
          el('div', 'memory-ui-summary-label memory-ui-summary-label--stm', {
            text: 'Contexte court terme'
          })
        );
        if (view.boardSummary) {
          summaryEl.appendChild(
            el('p', 'memory-ui-summary-text memory-ui-summary-text--stm', {
              text: view.boardSummary
            })
          );
        }
        if (view.shortNotes && view.shortNotes.length) {
          var sul = el('ul', 'memory-ui-facts memory-ui-facts--stm');
          view.shortNotes.slice(0, 6).forEach(function (f) {
            sul.appendChild(
              el('li', null, { text: typeof f === 'string' ? f : f.text || '' })
            );
          });
          summaryEl.appendChild(sul);
        }
      }
      onLayoutChange();
    }

    function appendMessage(role, text) {
      var row = el('div', 'memory-ui-msg memory-ui-msg--' + role);
      var bubble = el('div', 'memory-ui-bubble', { text: text || '' });
      row.appendChild(bubble);
      messagesEl.appendChild(row);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      onLayoutChange();
      return row;
    }

    function syncEmptyClass() {
      var empty =
        !input.querySelector('.memory-ui-hole') &&
        !getComposerRaw().replace(/\u200b/g, '').trim();
      input.classList.toggle('is-empty', empty);
      updateHolesState();
    }

    function updateHolesState() {
      var holes = input.querySelectorAll('.memory-ui-hole');
      for (var i = 0; i < holes.length; i++) {
        var hole = holes[i];
        var ph = hole.getAttribute('data-placeholder') || '\u2026';
        var vacant = isPlaceholderText(hole.textContent, ph);
        hole.classList.toggle('is-empty', vacant);
        if (vacant && !(hole.textContent || '').replace(/\u200b/g, '').trim()) {
          hole.textContent = ph;
        }
      }
    }

    function getComposerRaw() {
      return String(input.textContent || '');
    }

    function getComposerText() {
      var out = '';
      function walk(node) {
        if (!node) return;
        if (node.nodeType === 3) {
          out += node.textContent || '';
          return;
        }
        if (node.nodeType !== 1) return;
        if (node.classList && node.classList.contains('memory-ui-hole')) {
          var ph = node.getAttribute('data-placeholder') || '\u2026';
          var t = String(node.textContent || '').replace(/\u200b/g, '');
          if (!isPlaceholderText(t, ph)) out += t;
          return;
        }
        if (node.tagName === 'BR') {
          out += '\n';
          return;
        }
        var kids = node.childNodes;
        for (var i = 0; i < kids.length; i++) walk(kids[i]);
      }
      walk(input);
      return out.replace(/[ \t]+\n/g, '\n').replace(/\s+/g, ' ').trim();
    }

    function clearComposer() {
      input.replaceChildren();
      ghostEl.textContent = '';
      input.classList.add('is-empty');
      tabTarget = '';
    }

    function focusHole(holeEl) {
      if (!holeEl) return;
      focusInput();
      var ph = holeEl.getAttribute('data-placeholder') || '\u2026';
      if (isPlaceholderText(holeEl.textContent, ph)) {
        holeEl.textContent = ph;
        holeEl.classList.add('is-empty');
      }
      var range = document.createRange();
      range.selectNodeContents(holeEl);
      var sel = global.getSelection();
      if (!sel) return;
      sel.removeAllRanges();
      sel.addRange(range);
    }

    function placeCaretAtEnd(node) {
      focusInput();
      var range = document.createRange();
      range.selectNodeContents(node);
      range.collapse(false);
      var sel = global.getSelection();
      if (!sel) return;
      sel.removeAllRanges();
      sel.addRange(range);
    }

    function endsWithWordChar(s) {
      return /[0-9A-Za-zÀ-ÿ]$/.test(String(s || ''));
    }

    function applySuggestion(raw) {
      var segments = parseTemplate(raw);
      input.replaceChildren();
      var firstHole = null;
      var built = '';
      segments.forEach(function (seg) {
        if (seg.type === 'text') {
          if (seg.value) {
            input.appendChild(document.createTextNode(seg.value));
            built += seg.value;
          }
          return;
        }
        if (endsWithWordChar(built)) {
          input.appendChild(document.createTextNode(' '));
          built += ' ';
        }
        var hole = el('span', 'memory-ui-hole is-empty');
        var label = seg.label || '\u2026';
        hole.setAttribute('data-placeholder', label);
        hole.setAttribute('title', '\u00c0 remplir');
        hole.textContent = label;
        input.appendChild(hole);
        built += label;
        if (!firstHole) firstHole = hole;
      });
      syncEmptyClass();
      focusInput();
      if (firstHole) focusHole(firstHole);
      else placeCaretAtEnd(input);
      refreshSuggestionFilter();
      onLayoutChange();
    }

    function appendChipSegments(chip, raw) {
      var segments = parseTemplate(raw);
      chip.replaceChildren();
      segments.forEach(function (seg) {
        if (seg.type === 'text') {
          chip.appendChild(document.createTextNode(seg.value));
          return;
        }
        var hole = el('span', 'memory-ui-chip-hole', {
          text: seg.label || '\u2026'
        });
        chip.appendChild(hole);
      });
    }

    function rankSuggestions(query, list) {
      var q = normalizeMatch(query);
      var scored = [];
      (list || []).forEach(function (item) {
        if (!item) return;
        var plain = plainSuggestion(item);
        var nPlain = normalizeMatch(plain);
        var nPrefix = normalizeMatch(prefixBeforeHole(item));
        var score = -1;
        if (!q) score = 10;
        else if (nPlain.indexOf(q) === 0) score = 100 - Math.min(40, nPlain.length - q.length);
        else if (nPrefix && nPrefix.indexOf(q) === 0) score = 90 - Math.min(30, nPrefix.length - q.length);
        else if (q.indexOf(nPrefix) === 0 && nPrefix.length > 0) score = 80;
        else if (nPlain.indexOf(q) >= 0) score = 40;
        if (score >= 0) scored.push({ item: item, score: score, plain: plain });
      });
      scored.sort(function (a, b) {
        if (b.score !== a.score) return b.score - a.score;
        return a.plain.length - b.plain.length;
      });
      return scored;
    }

    function getBestAutocomplete(query) {
      var TA = global.TabAutocomplete;
      if (!TA) return null;
      var proposal = TA.propose(
        query,
        allSuggestions.map(function (s) {
          return { text: plainSuggestion(s), raw: s };
        })
      );
      if (!proposal || !proposal.candidate) return null;
      return proposal.candidate.raw != null ? proposal.candidate.raw : proposal.candidate.text;
    }

    function updateGhost(query, best) {
      var TA = global.TabAutocomplete;
      if (!TA || !ghostEl) return;
      var proposal = best
        ? TA.propose(
            query,
            allSuggestions.map(function (s) {
              return { text: plainSuggestion(s), raw: s };
            })
          )
        : null;
      if (
        proposal &&
        proposal.candidate &&
        parseTemplate(
          proposal.candidate.raw != null ? String(proposal.candidate.raw) : proposal.candidate.text
        ).some(function (s) {
          return s.type === 'hole';
        })
      ) {
        // Hole templates: skip ghost (widths won't match dashed boxes).
        ghostEl.textContent = '';
        inputWrap.classList.remove('has-ghost');
        return;
      }
      if (proposal && proposal.ghost) {
        ghostEl.textContent = proposal.ghost;
        inputWrap.classList.add('has-ghost');
      } else {
        ghostEl.textContent = '';
        inputWrap.classList.remove('has-ghost');
      }
    }

    function renderSuggestionChips(list, preferredTab) {
      suggestionsEl.replaceChildren();
      var items = (list || []).filter(Boolean).slice(0, 6);
      tabTarget = preferredTab || '';
      if (!items.length) {
        suggestionsEl.hidden = true;
        onLayoutChange();
        return;
      }
      suggestionsEl.hidden = false;
      items.forEach(function (label) {
        var chip = el('button', 'memory-ui-chip', { type: 'button' });
        appendChipSegments(chip, label);
        if (tabTarget && label === tabTarget) {
          chip.classList.add('is-tab-target');
          var hint = el('kbd', 'memory-ui-chip-tab tp-tab-hint', { text: 'Tab' });
          chip.appendChild(hint);
        }
        chip.addEventListener('click', function () {
          if (pending) return;
          var hasHole = parseTemplate(label).some(function (s) {
            return s.type === 'hole';
          });
          if (hasHole) {
            applySuggestion(label);
            return;
          }
          sendUser(plainSuggestion(label) || label);
        });
        suggestionsEl.appendChild(chip);
      });
      onLayoutChange();
    }

    function refreshSuggestionFilter() {
      var query = getComposerRaw().replace(/\u200b/g, '');
      var typed = getComposerText() || query.replace(/\u2026/g, '').replace(/\.{3,}/g, '');
      if (!getComposerText() && input.querySelector('.memory-ui-hole')) {
        typed = prefixFromComposer();
      }
      var ranked = rankSuggestions(typed, allSuggestions);
      var visible = ranked.map(function (r) {
        return r.item;
      });
      var best = getBestAutocomplete(typed);
      tabTarget = best || '';
      updateGhost(typed, best);
      renderSuggestionChips(visible.length ? visible : typed ? [] : allSuggestions, best);
      if (tabComplete) tabComplete.refresh();
    }

    function prefixFromComposer() {
      var out = '';
      var kids = input.childNodes;
      for (var i = 0; i < kids.length; i++) {
        var node = kids[i];
        if (node.nodeType === 3) out += node.textContent || '';
        else if (node.classList && node.classList.contains('memory-ui-hole')) break;
        else if (node.nodeType === 1) out += node.textContent || '';
      }
      return out;
    }

    function setSuggestions(list) {
      allSuggestions = (list || []).filter(Boolean).slice(0, 8);
      refreshSuggestionFilter();
    }

    function renderSuggestions(list) {
      setSuggestions(list);
    }

    function composerQuery() {
      if (!getComposerText() && input.querySelector('.memory-ui-hole')) {
        return prefixFromComposer();
      }
      return (
        getComposerText() ||
        getComposerRaw().replace(/\u200b/g, '').replace(/\u2026/g, '').replace(/\.{3,}/g, '')
      );
    }

    function acceptAutocomplete() {
      var TA = global.TabAutocomplete;
      if (!TA) return false;
      var typed = composerQuery();
      var proposal = TA.propose(
        typed,
        allSuggestions.map(function (s) {
          return { text: plainSuggestion(s), raw: s };
        })
      );
      if (!proposal) return false;

      var raw =
        proposal.candidate.raw != null ? proposal.candidate.raw : proposal.candidate.text;
      var hasHole = parseTemplate(String(raw)).some(function (s) {
        return s.type === 'hole';
      });

      if (proposal.mode === 'full' && hasHole) {
        var stem = prefixBeforeHole(raw);
        var typedRaw = getComposerText();
        var remainder = '';
        if (
          normalizeMatch(typedRaw).indexOf(normalizeMatch(stem.trim())) === 0 &&
          typedRaw.length >= stem.trim().length
        ) {
          remainder = typedRaw.slice(stem.trim().length).replace(/^\s+/, '');
        }
        applySuggestion(raw);
        var hole = input.querySelector('.memory-ui-hole');
        if (hole && remainder) {
          hole.textContent = remainder;
          hole.classList.remove('is-empty');
          placeCaretAtEnd(hole);
        }
        refreshSuggestionFilter();
        return true;
      }

      clearComposer();
      input.appendChild(document.createTextNode(proposal.nextValue));
      syncEmptyClass();
      placeCaretAtEnd(input);
      refreshSuggestionFilter();
      return true;
    }

    var tabComplete = null;
    if (global.TabAutocomplete) {
      tabComplete = global.TabAutocomplete.bind({
        field: input,
        wrapEl: inputWrap,
        ghostEl: ghostEl,
        getCandidates: function () {
          return allSuggestions.map(function (s) {
            return { text: plainSuggestion(s), raw: s };
          });
        },
        getValue: composerQuery,
        setValue: function (v) {
          clearComposer();
          input.appendChild(document.createTextNode(v));
          syncEmptyClass();
          placeCaretAtEnd(input);
        },
        isEnabled: function () {
          return !pending && !input.classList.contains('is-disabled');
        },
        onAccept: function (proposal) {
          // Reuse hole-aware acceptor; signal handled.
          var raw =
            proposal.candidate.raw != null
              ? proposal.candidate.raw
              : proposal.candidate.text;
          var hasHole = parseTemplate(String(raw)).some(function (s) {
            return s.type === 'hole';
          });
          if (proposal.mode === 'full' && hasHole) {
            acceptAutocomplete();
            return true;
          }
          clearComposer();
          input.appendChild(document.createTextNode(proposal.nextValue));
          syncEmptyClass();
          placeCaretAtEnd(input);
          refreshSuggestionFilter();
          return true;
        }
      });
    }

    function setComposerEnabled(on) {
      input.setAttribute('contenteditable', on ? 'true' : 'false');
      input.classList.toggle('is-disabled', !on);
      sendBtn.disabled = !on;
      if (on) focusInput();
    }

    function focusInput() {
      if (input.classList.contains('is-disabled')) return;
      try {
        input.focus({ preventScroll: true });
      } catch (e) {
        input.focus();
      }
    }

    async function finish(markComplete) {
      if (markComplete && mode === 'onboarding' && !memory.onboardingComplete) {
        memory = Mem.markOnboardingComplete(memory);
        memory = await Mem.save(t, memory);
      }
      if (onComplete) onComplete(memory);
    }

    async function sendUser(text) {
      var msg = (text || '').trim();
      if (!msg || pending) return;
      if (!Agent.isConfigured(provider)) {
        setError('Configurez d\'abord un fournisseur IA (Param\u00e8tres de priorit\u00e9).');
        return;
      }
      setError('');
      appendMessage('user', msg);
      history.push({ role: 'user', content: msg });
      answeredCount += 1;
      updateProgress();
      pending = true;
      sendBtn.disabled = true;
      focusInput();
      setSuggestions([]);
      var thinking = appendMessage('assistant', '\u2026');
      try {
        var turn = await Agent.memoryTurn(provider, history.slice(0, -1), memory, msg, {
          mode: mode,
          boardDigest: boardDigest
        });
        thinking.querySelector('.memory-ui-bubble').textContent =
          turn.message || 'Okay.';
        history.push({ role: 'assistant', content: turn.message || '' });
        if (turn.patches && turn.patches.length) {
          memory = await Mem.applyPatches(t, memory, turn.patches);
          renderSummary();
          updateProgress();
          if (memory.onboardingComplete && mode === 'onboarding' && onComplete) {
            // Soft complete — user can still Continuer
          }
        }
        if (turn.message && /\?/.test(turn.message)) {
          memory = Mem.markQuestionAsked(memory, turn.message);
          await Mem.save(t, memory);
        }
        setSuggestions(turn.suggestions);
      } catch (err) {
        console.error('MemoryUI send failed', err);
        thinking.querySelector('.memory-ui-bubble').textContent =
          'Erreur\u00a0: ' + ((err && err.message) || String(err));
        setError((err && err.message) || '\u00c9chec de l\'appel IA');
      } finally {
        pending = false;
        setComposerEnabled(Agent.isConfigured(provider));
        onLayoutChange();
        focusInput();
      }
    }

    function send() {
      var msg = getComposerText();
      if (!msg) {
        // Nudge user toward the first empty hole instead of sending blanks.
        var hole = input.querySelector('.memory-ui-hole.is-empty');
        if (hole) {
          focusHole(hole);
          return;
        }
      }
      clearComposer();
      focusInput();
      refreshSuggestionFilter();
      sendUser(msg);
    }

    sendBtn.addEventListener('click', send);

    input.addEventListener('keydown', function (e) {
      // Tab is handled by TabAutocomplete.bind when available.
      if (e.key === 'Tab' && !global.TabAutocomplete) {
        if (acceptAutocomplete()) {
          e.preventDefault();
        }
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        send();
        return;
      }
      // Typing inside an empty hole replaces the placeholder.
      if (
        e.key.length === 1 &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey
      ) {
        var sel = global.getSelection();
        if (!sel || !sel.rangeCount) return;
        var node = sel.anchorNode;
        var hole =
          node && node.nodeType === 1 && node.classList && node.classList.contains('memory-ui-hole')
            ? node
            : node && node.parentElement && node.parentElement.closest
              ? node.parentElement.closest('.memory-ui-hole')
              : null;
        if (hole && hole.classList.contains('is-empty')) {
          e.preventDefault();
          hole.textContent = e.key;
          hole.classList.remove('is-empty');
          placeCaretAtEnd(hole);
          syncEmptyClass();
          refreshSuggestionFilter();
        }
      }
    });

    input.addEventListener('input', function () {
      syncEmptyClass();
      refreshSuggestionFilter();
    });

    input.addEventListener('focus', function () {
      syncEmptyClass();
    });

    input.addEventListener('click', function (e) {
      var hole = e.target && e.target.closest ? e.target.closest('.memory-ui-hole') : null;
      if (hole && hole.classList.contains('is-empty')) {
        focusHole(hole);
      }
    });

    input.addEventListener('paste', function (e) {
      e.preventDefault();
      var text = '';
      try {
        text = (e.clipboardData || global.clipboardData).getData('text/plain') || '';
      } catch (err) {
        text = '';
      }
      text = text.replace(/\r\n/g, '\n');
      if (global.document && document.execCommand) {
        document.execCommand('insertText', false, text);
      } else {
        input.appendChild(document.createTextNode(text));
      }
      syncEmptyClass();
      refreshSuggestionFilter();
    });

    async function bootstrap() {
      appendMessage('assistant', 'Chargement du contexte du tableau\u2026');
      try {
        provider = await Agent.getProvider(t);
      } catch (e) {
        provider = Agent.normalizeProvider(null);
      }
      if (!Agent.isConfigured(provider)) {
        messagesEl.replaceChildren();
        appendMessage(
          'assistant',
          'Pour aligner l\'assistant, configurez d\'abord un fournisseur IA dans \u00ab\u00a0Param\u00e8tres de priorit\u00e9\u00a0\u00bb (menu du tableau).'
        );
        setComposerEnabled(false);
        renderSummary();
        updateProgress();
        onLayoutChange();
        return;
      }
      setComposerEnabled(true);
      memory = await Mem.load(t);
      try {
        var refreshed = await Mem.scanAndRefresh(t, provider, { force: false });
        memory = refreshed;
        if (refreshed && refreshed._openingQuestions) {
          delete refreshed._openingQuestions;
        }
      } catch (scanErr) {
        console.error('MemoryUI scan failed', scanErr);
      }
      try {
        if (global.PriorityTrello && PriorityTrello.scanBoardCards) {
          var scan = await PriorityTrello.scanBoardCards(t, {
            maxCards: 30,
            includePriority: false
          });
          boardDigest = (scan && scan.digest) || '';
        }
      } catch (e) {
        boardDigest = '';
      }
      renderSummary();
      messagesEl.replaceChildren();

      answeredCount = Math.min(
        TARGET_ANSWERS,
        (memoryView().facts && memoryView().facts.length) || 0
      );
      updateProgress();

      var opening =
        mode === 'onboarding'
          ? 'Salut\u00a0! J\'ai jet\u00e9 un \u0153il aux cartes. Pour mieux t\'aider\u00a0: c\'est quoi ton pr\u00e9nom / comment on t\'appelle dans l\'\u00e9quipe, et sur quoi tu bosses en ce moment\u00a0?'
          : 'Voici ce que je retiens du tableau. Qu\'est-ce que tu veux ajouter ou corriger\u00a0?';

      var openingQs = memory._openingQuestions || [];
      delete memory._openingQuestions;
      try {
        var turn = await Agent.memoryTurn(provider, [], memory, 'Commence l\'alignement.', {
          mode: mode,
          boardDigest: boardDigest
        });
        if (turn && turn.message) {
          opening = turn.message;
          if (turn.patches && turn.patches.length) {
            memory = await Mem.applyPatches(t, memory, turn.patches);
            renderSummary();
            updateProgress();
          }
          setSuggestions(
            turn.suggestions && turn.suggestions.length ? turn.suggestions : openingQs
          );
        } else {
          setSuggestions(
            openingQs.length
              ? openingQs
              : [
                  'Je m\'appelle\u2026',
                  'Je travaille sur\u2026',
                  'Mon patron s\'appelle\u2026',
                  'Les outils principaux sont\u2026'
                ]
          );
        }
      } catch (e) {
        setSuggestions(
          openingQs.length
            ? openingQs
            : ['Je m\'appelle\u2026', 'Je travaille sur\u2026', 'Mon patron s\'appelle\u2026']
        );
      }
      appendMessage('assistant', opening);
      history.push({ role: 'assistant', content: opening });
      if (/\?/.test(opening)) {
        memory = Mem.markQuestionAsked(memory, opening);
        await Mem.save(t, memory);
      }
      onLayoutChange();
      focusInput();
    }

    bootstrap();

    return {
      getMemory: function () {
        return memory;
      },
      el: containerEl
    };
  }

  global.MemoryUI = {
    mount: mount
  };
})(typeof window !== 'undefined' ? window : this);
