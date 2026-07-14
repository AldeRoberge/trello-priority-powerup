/**
 * Shared Tab autocomplete — complete fast across text fields.
 * High confidence → whole suggestion; otherwise → next word only.
 * Exposes window.TabAutocomplete (no bundler).
 */
(function (global) {
  'use strict';

  var HIGH_SCORE = 92;
  var HIGH_GAP = 18;
  var SINGLE_SCORE = 78;

  function normalize(s) {
    return String(s || '')
      .toLocaleLowerCase('fr-FR')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function asCandidate(item) {
    if (item == null) return null;
    if (typeof item === 'string') {
      var t = item.trim();
      if (!t) return null;
      return { text: t, raw: t };
    }
    if (typeof item === 'object') {
      var text = String(item.text != null ? item.text : item.label || item.value || '').trim();
      if (!text) return null;
      return {
        text: text,
        raw: item.raw != null ? item.raw : item
      };
    }
    return null;
  }

  /**
   * How many characters of `suggestion` are already covered by `typed`
   * (case-insensitive on letters; whitespace collapsed loosely).
   */
  function matchedSuggestionLength(typed, suggestion) {
    var a = String(typed || '');
    var b = String(suggestion || '');
    var i = 0;
    var j = 0;
    while (i < a.length && j < b.length) {
      var ca = a.charAt(i);
      var cb = b.charAt(j);
      if (/\s/.test(ca) && /\s/.test(cb)) {
        while (i < a.length && /\s/.test(a.charAt(i))) i++;
        while (j < b.length && /\s/.test(b.charAt(j))) j++;
        continue;
      }
      if (normalize(ca) === normalize(cb)) {
        i++;
        j++;
        continue;
      }
      break;
    }
    // If typed trails with spaces the suggestion doesn't yet have, still OK.
    while (i < a.length && /\s/.test(a.charAt(i))) i++;
    if (i < a.length) return -1;
    return j;
  }

  function canExtend(typed, suggestion) {
    if (!suggestion) return false;
    var q = normalize(typed);
    if (!q) return false;
    return matchedSuggestionLength(typed, suggestion) >= 0;
  }

  function scoreCandidate(query, candidate) {
    var q = normalize(query);
    var text = candidate.text;
    var nText = normalize(text);
    if (!q) return 8;
    if (nText.indexOf(q) === 0) {
      return 100 - Math.min(45, nText.length - q.length);
    }
    var idx = nText.indexOf(q);
    if (idx > 0) return 35 - Math.min(20, idx);
    return -1;
  }

  function rank(query, list) {
    var scored = [];
    (list || []).forEach(function (item) {
      var c = asCandidate(item);
      if (!c) return;
      var score = scoreCandidate(query, c);
      if (score < 0) return;
      scored.push({
        text: c.text,
        raw: c.raw,
        score: score
      });
    });
    scored.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return a.text.length - b.text.length;
    });
    return scored;
  }

  function nextWordChunk(remainder) {
    var rest = String(remainder || '');
    if (!rest) return '';
    var leading = rest.match(/^\s+/) ? rest.match(/^\s+/)[0] : '';
    var body = rest.slice(leading.length);
    if (!body) return leading;
    var m = body.match(/^\S+/);
    var chunk = m ? m[0] : '';
    if (!chunk) return leading;
    var after = body.slice(chunk.length);
    var trailing = after.match(/^\s+/) ? after.match(/^\s+/)[0] : '';
    // Keep at most one trailing space as a separator for continued typing.
    if (trailing) chunk += trailing.charAt(0) === '\n' ? '\n' : ' ';
    return leading + chunk;
  }

  function sharedPrefixAmong(extenders, fromIndex) {
    if (!extenders.length) return '';
    var slices = extenders.map(function (c) {
      return c.text.slice(fromIndex);
    });
    var first = slices[0];
    var n = first.length;
    for (var i = 1; i < slices.length; i++) {
      var s = slices[i];
      var k = 0;
      while (k < n && k < s.length && normalize(first.charAt(k)) === normalize(s.charAt(k))) {
        k++;
      }
      n = k;
      if (!n) break;
    }
    return first.slice(0, n);
  }

  /**
   * Decide the next Tab completion.
   * @returns {null|{
   *   candidate: object,
   *   mode: 'full'|'word',
   *   nextValue: string,
   *   confidence: number,
   *   ghost: string
   * }}
   */
  function propose(query, list) {
    var typed = String(query || '');
    var q = normalize(typed);
    if (!q) return null;

    var ranked = rank(typed, list).filter(function (c) {
      return canExtend(typed, c.text);
    });
    if (!ranked.length) return null;

    var best = ranked[0];
    var matched = matchedSuggestionLength(typed, best.text);
    if (matched < 0) return null;
    if (matched >= best.text.length) return null;

    var second = ranked[1];
    var gap = second ? best.score - second.score : 100;
    var unique = ranked.length === 1;

    var mode = 'word';
    if (unique && best.score >= SINGLE_SCORE) mode = 'full';
    else if (best.score >= HIGH_SCORE && gap >= HIGH_GAP) mode = 'full';
    else {
      // Unambiguous multi-word shared remainder → jump ahead in one Tab.
      var shared = sharedPrefixAmong(ranked, matched);
      var sharedWords = shared.trim().split(/\s+/).filter(Boolean);
      if (sharedWords.length >= 2 && shared.length >= 8) {
        mode = 'shared';
      }
    }

    var nextValue;
    if (mode === 'full') {
      nextValue = typed + best.text.slice(matched);
    } else if (mode === 'shared') {
      var sharedRun = sharedPrefixAmong(ranked, matched);
      nextValue = typed + sharedRun;
      if (normalize(nextValue) === normalize(best.text)) {
        mode = 'full';
        nextValue = typed + best.text.slice(matched);
      } else {
        mode = 'word';
      }
    } else {
      var piece = nextWordChunk(best.text.slice(matched));
      if (!piece) return null;
      nextValue = typed + piece;
    }

    if (!nextValue || normalize(nextValue) === normalize(typed)) return null;

    return {
      candidate: best,
      mode: mode === 'full' ? 'full' : 'word',
      nextValue: nextValue,
      confidence: best.score,
      ghost: best.text
    };
  }

  function isContentEditable(el) {
    return !!(
      el &&
      (el.getAttribute && el.getAttribute('contenteditable') === 'true' ||
        el.isContentEditable)
    );
  }

  function defaultGetValue(field) {
    if (!field) return '';
    if (isContentEditable(field)) return String(field.textContent || '');
    return String(field.value || '');
  }

  function defaultSetValue(field, value) {
    if (!field) return;
    if (isContentEditable(field)) {
      field.textContent = value;
      placeCaretAtEnd(field);
      return;
    }
    field.value = value;
    try {
      var len = value.length;
      field.setSelectionRange(len, len);
    } catch (e) {
      /* some input types */
    }
  }

  function placeCaretAtEnd(node) {
    try {
      node.focus({ preventScroll: true });
    } catch (e) {
      try {
        node.focus();
      } catch (e2) {
        /* ignore */
      }
    }
    var sel = global.getSelection && global.getSelection();
    if (!sel || !node) return;
    var range = document.createRange();
    range.selectNodeContents(node);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function updateGhost(wrapEl, ghostEl, typed, proposal) {
    if (!ghostEl) return;
    if (
      proposal &&
      proposal.ghost &&
      normalize(proposal.ghost).indexOf(normalize(typed)) === 0 &&
      typed.length > 0 &&
      typed.length < proposal.ghost.length &&
      proposal.mode === 'full'
    ) {
      ghostEl.textContent = proposal.ghost;
      if (wrapEl) wrapEl.classList.add('has-ghost');
      return;
    }
    // Word mode: ghost the best full candidate faintly when it's a clean prefix.
    if (
      proposal &&
      proposal.ghost &&
      normalize(proposal.ghost).indexOf(normalize(typed)) === 0 &&
      typed.length > 0 &&
      typed.length < proposal.ghost.length
    ) {
      ghostEl.textContent = proposal.ghost;
      if (wrapEl) wrapEl.classList.add('has-ghost');
      return;
    }
    ghostEl.textContent = '';
    if (wrapEl) wrapEl.classList.remove('has-ghost');
  }

  /**
   * Bind Tab completion to a field.
   * options: {
   *   field, getCandidates, getValue?, setValue?,
   *   ghostEl?, wrapEl?,
   *   isEnabled?, onProposal?, onAccept?,
   *   // onAccept(proposal) → false to cancel; true/void to apply default setValue
   * }
   */
  function bind(options) {
    options = options || {};
    var field = options.field;
    if (!field) throw new Error('TabAutocomplete.bind: field required');

    var getCandidates =
      typeof options.getCandidates === 'function'
        ? options.getCandidates
        : function () {
            return [];
          };
    var getValue =
      typeof options.getValue === 'function'
        ? options.getValue
        : function () {
            return defaultGetValue(field);
          };
    var setValue =
      typeof options.setValue === 'function'
        ? options.setValue
        : function (v) {
            defaultSetValue(field, v);
          };
    var isEnabled =
      typeof options.isEnabled === 'function'
        ? options.isEnabled
        : function () {
            return true;
          };
    var onProposal =
      typeof options.onProposal === 'function' ? options.onProposal : function () {};
    var onAccept =
      typeof options.onAccept === 'function' ? options.onAccept : null;

    function currentProposal() {
      if (!isEnabled()) return null;
      return propose(getValue(), getCandidates());
    }

    function refresh() {
      var typed = getValue();
      var proposal = null;
      if (isEnabled() && normalize(typed)) {
        proposal = propose(typed, getCandidates());
      }
      updateGhost(options.wrapEl, options.ghostEl, typed, proposal);
      onProposal(proposal);
      return proposal;
    }

    function accept() {
      if (!isEnabled()) return false;
      var proposal = currentProposal();
      if (!proposal) return false;
      if (onAccept) {
        var handled = onAccept(proposal);
        if (handled === false) return false;
        if (handled === true) {
          refresh();
          return true;
        }
      }
      setValue(proposal.nextValue);
      refresh();
      return true;
    }

    function onKeyDown(e) {
      if (e.key !== 'Tab' || e.shiftKey || e.altKey || e.metaKey || e.ctrlKey) return;
      if (accept()) {
        e.preventDefault();
        e.stopPropagation();
      }
    }

    function onInput() {
      refresh();
    }

    field.addEventListener('keydown', onKeyDown);
    field.addEventListener('input', onInput);

    refresh();

    return {
      refresh: refresh,
      accept: accept,
      propose: currentProposal,
      destroy: function () {
        field.removeEventListener('keydown', onKeyDown);
        field.removeEventListener('input', onInput);
        updateGhost(options.wrapEl, options.ghostEl, '', null);
      }
    };
  }

  /**
   * Ensure a standard ghost wrap around an input/textarea.
   * Returns { wrap, ghost, field }.
   */
  function wrapField(field, classNames) {
    classNames = classNames || {};
    var parent = field.parentNode;
    var wrap = document.createElement('div');
    wrap.className = classNames.wrap || 'tp-tab-complete-wrap';
    var ghost = document.createElement('div');
    ghost.className = classNames.ghost || 'tp-tab-complete-ghost';
    ghost.setAttribute('aria-hidden', 'true');
    if (parent) {
      parent.insertBefore(wrap, field);
    }
    wrap.appendChild(ghost);
    wrap.appendChild(field);
    if (field.classList) {
      field.classList.add(classNames.field || 'tp-tab-complete-field');
    }
    return { wrap: wrap, ghost: ghost, field: field };
  }

  global.TabAutocomplete = {
    normalize: normalize,
    rank: rank,
    propose: propose,
    canExtend: canExtend,
    bind: bind,
    wrapField: wrapField,
    HIGH_SCORE: HIGH_SCORE,
    SINGLE_SCORE: SINGLE_SCORE
  };
})(typeof window !== 'undefined' ? window : this);
