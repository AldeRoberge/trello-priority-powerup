/**
 * Compact conversational UI for AI memory alignment (modal + board bar).
 * Exposes window.MemoryUI.mount(container, options).
 */
(function (global) {
  'use strict';

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

    containerEl.innerHTML = '';
    containerEl.classList.add('memory-ui');

    var header = el('div', 'memory-ui-header');
    var title = el('h2', 'memory-ui-title', {
      text: mode === 'onboarding' ? 'Aligner l\'assistant' : 'M\u00e9moire de l\'assistant'
    });
    var subtitle = el('p', 'memory-ui-subtitle', {
      text:
        mode === 'onboarding'
          ? 'Quelques questions pour mieux contextualiser vos cartes et suggestions.'
          : 'Mettez \u00e0 jour les faits importants (bas du tableau).'
    });
    header.appendChild(title);
    header.appendChild(subtitle);
    containerEl.appendChild(header);

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
    var input = el('textarea', 'memory-ui-input', {
      rows: '2',
      placeholder: 'Votre r\u00e9ponse\u2026',
      'aria-label': 'Message'
    });
    var sendBtn = el('button', 'tp-btn tp-btn--primary memory-ui-send', {
      type: 'button',
      text: 'Envoyer'
    });
    composer.appendChild(input);
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

    function renderSummary() {
      if (summaryEl.hidden) return;
      summaryEl.replaceChildren();
      var label = el('div', 'memory-ui-summary-label', { text: 'M\u00e9moire actuelle' });
      summaryEl.appendChild(label);
      if (memory.summary) {
        summaryEl.appendChild(el('p', 'memory-ui-summary-text', { text: memory.summary }));
      }
      if (memory.facts && memory.facts.length) {
        var ul = el('ul', 'memory-ui-facts');
        memory.facts.slice(0, 8).forEach(function (f) {
          ul.appendChild(
            el('li', null, { text: typeof f === 'string' ? f : f.text || '' })
          );
        });
        summaryEl.appendChild(ul);
      } else if (!memory.summary) {
        summaryEl.appendChild(
          el('p', 'memory-ui-summary-empty', { text: 'Aucun fait enregistr\u00e9 pour l\'instant.' })
        );
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

    function renderSuggestions(list) {
      suggestionsEl.replaceChildren();
      var items = (list || []).filter(Boolean).slice(0, 4);
      if (!items.length) {
        suggestionsEl.hidden = true;
        onLayoutChange();
        return;
      }
      suggestionsEl.hidden = false;
      items.forEach(function (label) {
        var chip = el('button', 'memory-ui-chip', { type: 'button', text: label });
        chip.addEventListener('click', function () {
          if (pending) return;
          input.value = label;
          send();
        });
        suggestionsEl.appendChild(chip);
      });
      onLayoutChange();
    }

    function setComposerEnabled(on) {
      input.disabled = !on;
      sendBtn.disabled = !on;
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
      pending = true;
      setComposerEnabled(false);
      renderSuggestions([]);
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
          if (memory.onboardingComplete && mode === 'onboarding' && onComplete) {
            // Soft complete — user can still Continuer
          }
        }
        // Track asked question if assistant asked one
        if (turn.message && /\?/.test(turn.message)) {
          memory = Mem.markQuestionAsked(memory, turn.message);
          await Mem.save(t, memory);
        }
        renderSuggestions(turn.suggestions);
      } catch (err) {
        console.error('MemoryUI send failed', err);
        thinking.querySelector('.memory-ui-bubble').textContent =
          'Erreur\u00a0: ' + ((err && err.message) || String(err));
        setError((err && err.message) || '\u00c9chec de l\'appel IA');
      } finally {
        pending = false;
        setComposerEnabled(Agent.isConfigured(provider));
        onLayoutChange();
      }
    }

    function send() {
      var msg = input.value;
      input.value = '';
      sendUser(msg);
    }

    sendBtn.addEventListener('click', send);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        send();
      }
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

      var opening =
        mode === 'onboarding'
          ? 'Bonjour\u00a0! J\'ai parcouru vos cartes. Pour mieux vous aider\u00a0: comment vous appelez-vous au sein de l\'\u00e9quipe, et sur quoi travaillez-vous aujourd\'hui\u00a0?'
          : 'Voici ce que je retiens du tableau. Que voulez-vous ajouter ou corriger dans ma m\u00e9moire\u00a0?';

      // Prefer model-generated opener if we can get one cheaply
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
          }
          renderSuggestions(
            turn.suggestions && turn.suggestions.length ? turn.suggestions : openingQs
          );
        } else {
          renderSuggestions(
            openingQs.length
              ? openingQs
              : [
                  'Je travaille sur\u2026',
                  'Mon patron s\'appelle\u2026',
                  'Les outils principaux sont\u2026'
                ]
          );
        }
      } catch (e) {
        renderSuggestions(
          openingQs.length
            ? openingQs
            : ['Je travaille sur\u2026', 'Mon patron s\'appelle\u2026', 'Passer']
        );
      }
      appendMessage('assistant', opening);
      history.push({ role: 'assistant', content: opening });
      if (/\?/.test(opening)) {
        memory = Mem.markQuestionAsked(memory, opening);
        await Mem.save(t, memory);
      }
      onLayoutChange();
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
