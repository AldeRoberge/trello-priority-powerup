/**
 * agent-provider: part 2 of 2 (highlight).
 * Names are shared with the other parts through window.PriorityAgentParts (see agent-provider.parts.json for the load order).
 */
(function (global) {
  'use strict';

  var S = (global.PriorityAgentParts = global.PriorityAgentParts || {});

  // from other parts (functions, resolved at call time)
  function actionsReachFullProgress() { return S.actionsReachFullProgress.apply(this, arguments); }
  function buildInterviewNextPivot() { return S.buildInterviewNextPivot.apply(this, arguments); }
  function contextProgressComplete() { return S.contextProgressComplete.apply(this, arguments); }
  function looksLikeDueAskMessage() { return S.looksLikeDueAskMessage.apply(this, arguments); }
  function foldMatchText() { return S.foldMatchText.apply(this, arguments); }
  function stripInterviewMarkup() { return S.stripInterviewMarkup.apply(this, arguments); }

  var ECHO_CONFIRM_STOPWORDS = {
    pour: true,
    surtout: true,
    cest: true,
    ca: true,
    une: true,
    des: true,
    les: true,
    le: true,
    la: true,
    un: true,
    et: true,
    ou: true,
    de: true,
    du: true,
    au: true,
    aux: true,
    en: true,
    que: true,
    qui: true,
    sur: true,
    dans: true,
    avec: true,
    pas: true,
    plus: true,
    bien: true,
    tout: true,
    tous: true,
    cette: true,
    cet: true,
    ces: true,
    son: true,
    sa: true,
    ses: true,
    mon: true,
    ma: true,
    mes: true,
    ton: true,
    ta: true,
    tes: true,
    notre: true,
    nos: true,
    votre: true,
    vos: true,
    est: true,
    sont: true,
    etre: true,
    fait: true,
    faire: true,
    veux: true,
    veut: true,
    sert: true,
    but: true,
    goal: true,
    the: true,
    and: true,
    for: true,
    to: true,
    of: true,
    a: true,
    an: true,
    is: true,
    it: true,
    this: true,
    that: true
  };

  function foldEchoToken(word) {
    return String(word || '')
      .toLocaleLowerCase('fr-FR')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '');
  }

  function tokenizeForEchoOverlap(text) {
    var raw = stripInterviewMarkup(text)
      .toLocaleLowerCase('fr-FR')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w\s]/g, ' ');
    var parts = raw.split(/\s+/);
    var out = [];
    var seen = Object.create(null);
    for (var i = 0; i < parts.length; i++) {
      var w = foldEchoToken(parts[i]);
      if (!w || w.length < 3 || ECHO_CONFIRM_STOPWORDS[w] || seen[w]) continue;
      seen[w] = true;
      out.push(w);
    }
    return out;
  }

  function titleTokenOverlapRatio(message, cardName) {
    var msgToks = tokenizeForEchoOverlap(message);
    var titleToks = tokenizeForEchoOverlap(cardName);
    if (!titleToks.length || !msgToks.length) return 0;
    var titleSet = Object.create(null);
    for (var i = 0; i < titleToks.length; i++) titleSet[titleToks[i]] = true;
    var hits = 0;
    for (var j = 0; j < msgToks.length; j++) {
      if (titleSet[msgToks[j]]) hits += 1;
    }
    return hits / titleToks.length;
  }

  /**
   * Stupid interview questions that only restate the card title as a yes/no
   * confirmation ("C'est surtout pour faciliter l'accès…, c'est ça?").
   */
  function looksLikeTitleEchoConfirmAsk(message, cardName) {
    var raw = stripInterviewMarkup(message);
    if (!raw || raw.indexOf('?') < 0) return false;
    var title = String(cardName || '').trim();
    if (!title) return false;
    var t = raw.toLocaleLowerCase('fr-FR');
    // Impact / ownership confirms are useful — not title echoes.
    if (
      /\bc['']est\s+toi\b/.test(t) ||
      /\bc['']est\s+\[\[a:toi\]\]/i.test(message) ||
      /\btu\s+t['']en\s+occupes\b/.test(t) ||
      /\bc['']est\s+toi\s+qui\b/.test(t)
    ) {
      return false;
    }
    var looksConfirm =
      /c['']est\s+[cç]a\s*\?/.test(t) ||
      /c['']est\s+bien\s+[cç]a\s*\?/.test(t) ||
      /\bright\s*\?/.test(t) ||
      /\bcorrect\s*\?/.test(t) ||
      /c['']est\s+surtout\s+pour\b/.test(t) ||
      /[cç]a\s+sert\s+[àa]\s+/.test(t) ||
      /le\s+but\s+(?:c['']est|est)\b/.test(t) ||
      /c['']est\s+pour\b/.test(t);
    if (!looksConfirm) return false;
    return titleTokenOverlapRatio(raw, title) >= 0.5;
  }

  /**
   * Replace title-echo confirmations with the next useful interview pivot.
   * Avoid bouncing back to another urgency ask if one was already posed.
   */
  function applyInterviewEchoGuards(turn, context, history) {
    turn = turn && typeof turn === 'object' ? turn : {};
    var message = typeof turn.message === 'string' ? turn.message : '';
    var cardName = (context && context.cardName) || '';
    if (!looksLikeTitleEchoConfirmAsk(message, cardName)) return turn;

    var urgencyAlready = false;
    function noteUrgency(text) {
      var t = stripInterviewMarkup(text).toLocaleLowerCase('fr-FR');
      if (/c['']est\s+grave/.test(t) || /[cç]a\s+presse/.test(t)) {
        urgencyAlready = true;
      }
    }
    var asked =
      context && context.interview && Array.isArray(context.interview.asked)
        ? context.interview.asked
        : [];
    for (var i = 0; i < asked.length; i++) noteUrgency(asked[i]);
    (history || []).forEach(function (entry) {
      if (entry && entry.role === 'assistant') noteUrgency(entry.content);
    });

    var pivotContext = context;
    if (
      urgencyAlready &&
      !(context && context.interview && context.interview.priorityAxesTrusted)
    ) {
      pivotContext = Object.assign({}, context || {}, {
        interview: Object.assign({}, (context && context.interview) || {}, {
          priorityAxesTrusted: true
        })
      });
    }

    var next = buildInterviewNextPivot(pivotContext);
    return Object.assign({}, turn, {
      message: next.message,
      suggestions: next.suggestions,
      suggestionsMulti: next.suggestionsMulti,
      suggestionScale: next.suggestionScale,
      completeInterview: !!next.completeInterview
    });
  }

  function looksLikeCongratulation(message) {
    if (typeof message !== 'string' || !message) return false;
    return /\b(bravo|f[eé]licitations|chapeau|pli[eé]|bien jou[eé]|nice\b|woo+hoo|yay|congrats?|well\s+done)\b/i.test(
      message
    );
  }

  /**
   * Completed task + deadline ask is nonsense. When this turn hits 100%,
   * force a short congratulations; when already at 100%, strip due asks.
   */
  function polishMessageAfterProgressComplete(message, actions, context) {
    var completing = actionsReachFullProgress(actions);
    var alreadyDone = contextProgressComplete(context);
    if (!completing && !alreadyDone) return message;
    if (!looksLikeDueAskMessage(message)) {
      if (
        completing &&
        !looksLikeCongratulation(message) &&
        /^\s*(okay|ok|d['']accord|c['']est not[eé]|progr[eè]s mis)\b/i.test(
          String(message || '')
        )
      ) {
        return 'Bravo, c\'est pli\u00e9 !';
      }
      return message;
    }
    if (completing) return 'Bravo, c\'est pli\u00e9 !';
    return 'Pas besoin d\'\u00e9ch\u00e9ance : c\'est d\u00e9j\u00e0 termin\u00e9.';
  }

  function ensureProgressCelebration(actions) {
    if (!actionsReachFullProgress(actions)) return actions || [];
    var list = Array.isArray(actions) ? actions.slice() : [];
    var hasEffect = list.some(function (a) {
      return a && a.tool === 'trigger_effect';
    });
    if (!hasEffect) {
      list.push({ tool: 'trigger_effect', args: { effect: 'confetti' } });
    }
    return list;
  }

  function looksLikeQuebecLibrePhrase(text) {
    var raw = String(text || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!raw) return false;
    return (
      /\bvive\s+le\s+quebec(\s+libre)?\b/.test(raw) ||
      /\bquebec\s+libre\b/.test(raw) ||
      /\bgens\s+du\s+pays\b/.test(raw)
    );
  }

  /**
   * "Pu bloqué", "c'est pu bloqué", "ça bloque pu", "plus bloquée", "débloqué"…
   * (Québec: « pu » = « plus »). Accent- and apostrophe-insensitive.
   */
  function looksLikeUnblockedPhrase(text) {
    var raw = String(text || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!raw) return false;
    // Still blocked / negated unblock ("pas debloque", "toujours bloque").
    if (/\b(pas|jamais)\s+(encore\s+)?debloqu/.test(raw)) return false;
    return (
      /\b(pu|plus|p)\s+(du\s+tout\s+)?bloquee?s?\b/.test(raw) ||
      /\bbloque\s+(pu|plus)\b/.test(raw) ||
      /\bbloquent\s+(pu|plus)\b/.test(raw) ||
      /\b(est|c|ca|cest|suis|sont)\s+(pu|plus)\s+(en\s+attente|bloquee?s?)\b/.test(raw) ||
      /\bdebloquee?s?\b/.test(raw) ||
      /\bdebloquer\b/.test(raw) ||
      /\bpas\s+(ou\s+plus\s+)?bloquee?s?\b/.test(raw)
    );
  }

  /** A "reason" that is really the user saying it is no longer blocked. */
  function isUnblockedReasonText(reason) {
    return looksLikeUnblockedPhrase(reason) && !/\ben\s+attente\b/i.test(String(reason || ''));
  }

  function ensureUnblockedIntent(actions, userText) {
    var list = Array.isArray(actions) ? actions.slice() : [];
    if (!looksLikeUnblockedPhrase(userText)) return list;
    var unblock = { tool: 'set_blocked', args: { enAttente: false, blockedReasons: [], blockedLinks: [] } };
    var replaced = false;
    for (var i = 0; i < list.length; i++) {
      var a = list[i];
      if (!a || a.tool !== 'set_blocked') continue;
      var args = a.args && typeof a.args === 'object' ? a.args : {};
      var reasons = Array.isArray(args.blockedReasons) ? args.blockedReasons : [];
      var reasonsAreUnblock =
        reasons.length > 0 && reasons.every(isUnblockedReasonText);
      // Model blocked the card with an "unblock" phrase as the cause → flip it.
      if (args.enAttente === false) {
        replaced = true;
      } else if (reasonsAreUnblock || !reasons.length) {
        list[i] = unblock;
        replaced = true;
      }
      break;
    }
    if (!replaced) list.push(unblock);
    return list;
  }

  function ensureQuebecLibreEffect(actions, userText) {
    if (!looksLikeQuebecLibrePhrase(userText)) return actions || [];
    var list = Array.isArray(actions) ? actions.slice() : [];
    var quebecAction = {
      tool: 'trigger_effect',
      args: {
        effect: 'fleur_de_lys',
        text: 'VIVE LE QU\u00c9BEC'
      }
    };
    var replaced = false;
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].tool === 'trigger_effect') {
        list[i] = quebecAction;
        replaced = true;
        break;
      }
    }
    if (!replaced) list.push(quebecAction);
    return list;
  }

  function filterDueSuggestionsWhenComplete(suggestions, actions, context) {
    if (!actionsReachFullProgress(actions) && !contextProgressComplete(context)) {
      return suggestions;
    }
    var list = Array.isArray(suggestions) ? suggestions : [];
    return list.filter(function (s) {
      var text =
        typeof s === 'string'
          ? s
          : s && typeof s === 'object'
            ? String(s.text || s.label || '')
            : '';
      // Not \b: JS treats é as a non-word character, so \b never matches before « échéance ».
      return !/(?:^|[^a-z\u00e0-\u00ff])(?:\u00e9ch[e\u00e9]ance|deadline|date\s+limite)(?![a-z\u00e0-\u00ff])/i.test(text);
    });
  }

  /**
   * Guard a turn after progress hits / is already 100%: congratulate,
   * never ask for a due date, drop due chips, fire confetti.
   */
  function applyProgressCompleteGuards(turn, context) {
    turn = turn && typeof turn === 'object' ? turn : {};
    var actions = ensureProgressCelebration(turn.actions || []);
    var message = polishMessageAfterProgressComplete(
      turn.message || '',
      actions,
      context
    );
    var suggestions = filterDueSuggestionsWhenComplete(
      turn.suggestions,
      actions,
      context
    );
    var emotion = turn.emotion || null;
    if (actionsReachFullProgress(actions) && looksLikeCongratulation(message)) {
      emotion = emotion || 'happy';
    }
    return {
      message: message,
      actions: actions,
      suggestions: suggestions,
      emotion: emotion
    };
  }

  /** Drop space / NBSP / thin-space before ? ! . … (no French « espace fine »). */
  function stripSpaceBeforePunctuation(text) {
    if (typeof text !== 'string' || !text) return text;
    return text.replace(/[\s\u00a0\u202f\u2007\u2009]+([?!.…])/g, '$1');
  }

  /** Replace unicode em dashes in visible copy (models love them; we don't). */
  function stripEmDashes(text) {
    if (typeof text !== 'string' || !text) return text;
    return text
      .replace(/\s*\u2014\s*/g, ' - ')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  /** Drop patronizing "(0 = …, 4 = …)" scale legends from assistant copy. */
  function stripScaleLegendParenthetical(message) {
    if (typeof message !== 'string' || !message) return message;
    return stripSpaceBeforePunctuation(
      message
        .replace(
          /\s*\(\s*[0-5]\s*=\s*[^)]{1,80},\s*[0-5]\s*=\s*[^)]{1,80}\)\s*(?=[?!.…]|$)/gi,
          ''
        )
        .replace(/\s{2,}/g, ' ')
        .trim()
    );
  }

  /** Final message polish — always strip space-before-? after other rewrites. */
  function polishAssistantVisibleText(message) {
    return normalizeHighlightMarkup(
      stripSpaceBeforePunctuation(
        stripEmDashes(
          ensureContrastHighlights(
            ensurePriorityHighlights(
              stripInterviewConclusionFraming(rewriteWinkEmoticons(message))
            )
          )
        )
      )
    );
  }

  /**
   * Replace text winkys (;) / ;-) and the wink emoji with a friendly smile.
   * Wink overuse reads as creepy / try-hard.
   */
  function rewriteWinkEmoticons(message) {
    if (typeof message !== 'string' || !message) return message;
    var smile = '\ud83d\ude0a';
    var out = message
      .replace(/;-?\)/g, smile)
      .replace(/\ud83d\ude09/g, smile);
    out = out.replace(new RegExp(smile + '\\s*' + smile, 'g'), smile);
    return out;
  }

  function escapeRegExp(s) {
    return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Repair common model typos in highlight markers (spaces, case, single ]).
   */
  function normalizeHighlightMarkup(message) {
    if (typeof message !== 'string' || !message) return message || '';
    return message
      .replace(
        /\[\[\s*([grya])\s*:\s*([^\]]{1,120}?)\s*\]\]/gi,
        function (_m, color, phrase) {
          return '[[' + String(color).toLowerCase() + ':' + phrase + ']]';
        }
      )
      .replace(
        /\[\[\s*([grya])\s*:\s*([^\]]{1,120}?)\s*\](?!\])/gi,
        function (_m, color, phrase) {
          return '[[' + String(color).toLowerCase() + ':' + phrase + ']]';
        }
      );
  }

  /** Pull [[g:/r:/y:/a:…]] spans from assistant copy (visible text only). */
  function extractHighlightSpans(message) {
    var out = [];
    if (typeof message !== 'string' || !message) return out;
    var re = /\[\[\s*(g|r|y|a)\s*:\s*([^\]]{1,80}?)\s*\]\]/gi;
    var m;
    while ((m = re.exec(message))) {
      var text = String(m[2] || '').trim();
      if (!text) continue;
      out.push({ color: m[1].toLowerCase(), text: text });
    }
    return out;
  }

  function contrastColorForPhrase(phrase) {
    var f = foldMatchText(phrase);
    if (!f) return null;
    if (
      /\b(pas encore|difficile|pas commenc|pas fait|non\b|plus tard|jamais|urgent|grave|chers?|trop|lourd|pes[eè]|stress|lourdement)\b/.test(
        f
      )
    ) {
      return 'r';
    }
    if (
      /\b(deja|commence|termin|simple|facile|oui\b|yes\b|fait\b|presque|un peu|pas cher|jaser|blablater|chill|leger|l[eé]ger)\b/.test(
        f
      )
    ) {
      return 'g';
    }
    return null;
  }

  /** Drop leading glue words so highlights land on the meaningful bit. */
  function trimHighlightLead(phrase) {
    var words = String(phrase || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    var skip =
      /^(est-ce|que|est|c['']est|ca|ç[aà]|tu|as|a|le|la|les|un|une|des|du|de|d['']|sur|pour|et|si|on|l['']|juste|plut[oô]t|alors|donc|bien|encore|vraiment|parler)$/i;
    while (words.length > 1 && skip.test(words[0])) words.shift();
    return words.join(' ');
  }

  function wrapHighlightIfBare(message, phrase, color) {
    if (!phrase || !color || !message) return message;
    if (message.indexOf('[[' + color + ':' + phrase + ']]') >= 0) return message;
    // Already wrapped with any color?
    var wrapped = new RegExp(
      '\\[\\[(?:g|r|y|a):' + escapeRegExp(phrase) + '\\]\\]',
      'i'
    );
    if (wrapped.test(message)) return message;
    var re = new RegExp(
      '(^|[^\\w\\u00C0-\\u024F\\[\\]])(' +
        escapeRegExp(phrase) +
        ')(?![\\w\\u00C0-\\u024F]|:\\])',
      'i'
    );
    return message.replace(re, function (_full, lead, match) {
      return lead + '[[' + color + ':' + match + ']]';
    });
  }

  /**
   * Highlight A-vs-B alternatives in "… X ou Y ?" questions.
   * Positive / started / easy → green; not-yet / hard / stop → red.
   */
  function ensureContrastHighlights(message) {
    if (typeof message !== 'string' || !message) return message;
    var out = message;
    var qIdx = out.lastIndexOf('?');
    if (qIdx < 0) return out;

    var clauseStart = 0;
    for (var i = qIdx - 1; i >= 0; i--) {
      var ch = out.charAt(i);
      if (ch === '.' || ch === '!' || ch === '\n') {
        clauseStart = i + 1;
        break;
      }
    }
    var clause = out.slice(clauseStart, qIdx);
    if (/\[\[(?:g|r):/.test(clause) && /\[\[g:/.test(clause) && /\[\[r:/.test(clause)) {
      return out;
    }
    var bareClause = clause.replace(/\[\[(?:g|r|y|a):([^\]]+)\]\]/gi, '$1');
    var ou = bareClause.match(/^(.*?)\s+ou\s+(.*?)\s*$/i);
    if (!ou) return out;

    var before = String(ou[1] || '').trim();
    var after = String(ou[2] || '').trim();
    if (!before || !after) return out;

    var leftPhrase = null;
    var leftKnown = before.match(
      /\b(d[eé]j[aà]\s+(?:[eé]t[eé]\s+)?(?:commenc[eé]e?s?|termin[eé]e?s?|fait)|tr[eè]s\s+(?:facile|difficile)|assez\s+(?:facile|difficile|urgent)|plut[oô]t\s+(?:facile|difficile|simple)|pas\s+chers?|chers?|facile|simple|difficile|commenc[eé]e?s?|rien\s+de\s+lourd|parler\s+de\s+lourd)\s*$/i
    );
    if (leftKnown) leftPhrase = leftKnown[1];
    else {
      var words = before.split(/\s+/).filter(Boolean);
      var skipLead =
        /^(est-ce|que|est|c['']est|ca|ç[aà]|tu|as|a|le|la|les|un|une|des|du|de|sur|pour|et|si|on|l['']|d['']|t['']as|besoin|parler)$/i;
      while (words.length > 2 && skipLead.test(words[0])) words.shift();
      leftPhrase = words.slice(-Math.min(4, words.length)).join(' ');
    }
    leftPhrase = trimHighlightLead(leftPhrase);

    var rightPhrase = after.replace(/^[«"'\s]+|[»"'\s]+$/g, '');
    var rightWords = rightPhrase.split(/\s+/).filter(Boolean);
    var skipRight =
      /^(est-ce|que|est|c['']est|ca|ç[aà]|tu|as|a|le|la|les|un|une|des|du|de|sur|pour|et|si|on|l['']|d['']|juste|plut[oô]t|alors|donc|bien|encore|vraiment)$/i;
    while (rightWords.length > 2 && skipRight.test(rightWords[0])) {
      rightWords.shift();
    }
    // Prefer the meaningful tail — never chop trailing words like «peu».
    if (rightWords.length > 5) {
      rightPhrase = rightWords.slice(-5).join(' ');
    } else {
      rightPhrase = rightWords.join(' ');
    }
    rightPhrase = trimHighlightLead(rightPhrase);
    if (!leftPhrase || leftPhrase.length < 2 || !rightPhrase || rightPhrase.length < 2) {
      return out;
    }

    var leftColor = contrastColorForPhrase(leftPhrase) || 'g';
    var rightColor = contrastColorForPhrase(rightPhrase) || 'r';
    // Same polarity (both green/red) → force green-then-red contrast.
    if (leftColor === rightColor) {
      leftColor = 'g';
      rightColor = 'r';
    }

    out = wrapHighlightIfBare(out, leftPhrase, leftColor);
    out = wrapHighlightIfBare(out, rightPhrase, rightColor);
    return out;
  }

  function overlapTokens(a, b) {
    var ta = String(a || '')
      .split(/[^a-z0-9]+/)
      .filter(function (t) {
        return t.length >= 3;
      });
    var set = {};
    String(b || '')
      .split(/[^a-z0-9]+/)
      .forEach(function (t) {
        if (t.length >= 3) set[t] = true;
      });
    var n = 0;
    for (var i = 0; i < ta.length; i++) {
      if (set[ta[i]]) n += 1;
    }
    return n;
  }

  /** Content tokens (len ≥ 3) for highlight ↔ chip matching. */
  function highlightContentTokens(fold) {
    return String(fold || '')
      .split(/[^a-z0-9]+/)
      .filter(function (t) {
        return t.length >= 3;
      });
  }

  /**
   * True when a suggestion chip should inherit a highlight color.
   * Short chips like «Rien» must not match a longer span «rien de lourd».
   */
  function suggestionMatchesHighlight(foldSug, foldSpan) {
    if (!foldSug || !foldSpan || foldSpan.length < 2) return false;
    if (foldSug === foldSpan) return true;
    var sugTok = highlightContentTokens(foldSug);
    var spanTok = highlightContentTokens(foldSpan);
    if (!sugTok.length || !spanTok.length) return false;
    // One-token chip: only match a span that is essentially that token.
    if (sugTok.length === 1) {
      return spanTok.length === 1 && sugTok[0] === spanTok[0];
    }
    if (foldSug.indexOf(foldSpan) >= 0 || foldSpan.indexOf(foldSug) >= 0) {
      return true;
    }
    return overlapTokens(foldSug, foldSpan) >= 2;
  }

  /**
   * Color suggestion chips from [[g:/r:/y:]] phrases in the message so
   * alternatives visually match the question.
   */
  function linkSuggestionColorsToHighlights(suggestions, message) {
    var list = Array.isArray(suggestions) ? suggestions : [];
    var spans = extractHighlightSpans(message).filter(function (s) {
      return s.color === 'g' || s.color === 'r' || s.color === 'y' || s.color === 'a';
    });
    if (!list.length || !spans.length) return list;

    var hasGreen = spans.some(function (s) {
      return s.color === 'g';
    });
    var hasRed = spans.some(function (s) {
      return s.color === 'r';
    });

    return list.map(function (entry) {
      if (!entry || typeof entry !== 'object') return entry;
      // Keep impact-reach named accents (blue/teal circles).
      if (entry.color === 'blue' || entry.color === 'teal') return entry;
      var foldSug = foldMatchText(entry.text);
      if (!foldSug) return entry;
      var matched = null;
      var bestScore = 0;
      for (var i = 0; i < spans.length; i++) {
        var span = spans[i];
        var foldSpan = foldMatchText(span.text);
        if (!suggestionMatchesHighlight(foldSug, foldSpan)) continue;
        var score = overlapTokens(foldSug, foldSpan);
        if (foldSug === foldSpan) score += 10;
        if (score >= bestScore) {
          bestScore = score;
          matched = span.color;
        }
      }
      if (!matched && hasGreen && hasRed) {
        if (
          /^(oui|yes|ok|deja|un peu|presque|commence|termin|fait|simple|facile|jaser|blablater)\b/.test(
            foldSug
          ) ||
          /\b(deja|commence|un peu|presque|termin|jaser|blablater)\b/.test(foldSug)
        ) {
          matched = 'g';
        } else if (
          /^(non|no|pas encore|pas du tout|jamais|difficile|plus tard|lourd)\b/.test(
            foldSug
          ) ||
          /\b(pas encore|pas commenc|difficile|lourd|pes[eè]|p[eè]se)\b/.test(foldSug)
        ) {
          matched = 'r';
        }
      }
      if (!matched) return entry;
      var next = {
        text: entry.text,
        heat: entry.heat,
        icon: entry.icon || null,
        color: entry.color || null,
        hl: matched
      };
      if (matched === 'g') {
        next.heat = 0;
        if (next.color === 'red' || next.color === 'orange' || next.color === 'yellow') {
          next.color = null;
        }
      } else if (matched === 'y') {
        next.heat = 2;
      } else if (matched === 'r') {
        next.heat = 4;
        if (next.color === 'green' || next.color === 'lime') {
          next.color = null;
        }
      }
      return next;
    });
  }

  /**
   * If the model forgot [[g:/r:/y:]] markers on a priority-ish reply,
   * wrap common axis / tier labels so the UI can highlight them.
   */
  function ensurePriorityHighlights(message) {
    if (typeof message !== 'string' || !message) return message;
    if (/\[\[(?:g|r|y):/.test(message)) return message;
    if (
      !/(urgence|impact|facilit|priorit|facile|difficile|mod[eé]r[eé]e|critique|urgente|importante|flexible|secondaire|optionnelle|moyenne?|sur toi)/i.test(
        message
      )
    ) {
      return message;
    }

    // Longest phrases first so "Très difficile" wins over "Difficile".
    var phrases = [
      { t: 'Très difficile', c: 'r' },
      { t: 'Très facile', c: 'g' },
      { t: 'Super facile', c: 'g' },
      { t: 'Aucune pression', c: 'g' },
      { t: 'pas si simple', c: 'r' },
      { t: 'assez facile', c: 'g' },
      { t: 'assez urgente', c: 'y' },
      { t: 'vraiment urgente', c: 'r' },
      { t: 'peu urgente', c: 'g' },
      { t: 'pas urgente', c: 'g' },
      { t: 'Sur toi', c: 'g' },
      { t: 'Optionnelle', c: 'g' },
      { t: 'Secondaire', c: 'g' },
      { t: 'Prioritaire', c: 'y' },
      { t: 'Importante', c: 'y' },
      { t: 'Flexible', c: 'g' },
      { t: 'Critique', c: 'r' },
      { t: 'Urgente', c: 'r' },
      { t: 'Modérée', c: 'y' },
      { t: 'Élevée', c: 'r' },
      { t: 'Elevée', c: 'r' },
      { t: 'Difficile', c: 'r' },
      { t: 'Facile', c: 'g' },
      { t: 'Moyen', c: 'y' },
      { t: 'Moyenne', c: 'y' },
      { t: 'Faible', c: 'g' },
      { t: 'Aucune', c: 'g' },
      { t: 'Personnel', c: 'g' },
      { t: 'Équipe', c: 'y' },
      { t: 'Equipe', c: 'y' },
      { t: 'Interne', c: 'y' },
      { t: 'Population', c: 'g' },
      { t: 'Global', c: 'g' },
      { t: 'urgente', c: 'r' },
      { t: 'simple', c: 'g' }
    ];

    var out = message;
    var slots = [];
    phrases.forEach(function (p) {
      var re = new RegExp(
        '(^|[^\\w\\u00C0-\\u024F\\[\\]])(' + escapeRegExp(p.t) + ')(?![\\w\\u00C0-\\u024F]|:\\])',
        'gi'
      );
      out = out.replace(re, function (full, lead, match) {
        // Skip the axis header "Facilité" (contains "Facil…" but not exact "Facile" with our phrase list).
        if (/^facilit/i.test(match) && match.length > 6) return full;
        var i = slots.length;
        slots.push('[[' + p.c + ':' + match + ']]');
        return lead + '\u0000HL' + i + '\u0000';
      });
    });
    out = out.replace(/\u0000HL(\d+)\u0000/g, function (_m, i) {
      return slots[Number(i)];
    });
    return out;
  }

  /**
   * Drop "Pour finir / Une dernière question / …" framing that creates a
   * false "conclusion" loop — keep asking plainly when a question remains.
   * Also rewrite soft yes/no offers into direct value questions.
   */
  function stripInterviewConclusionFraming(message) {
    if (typeof message !== 'string' || !message) return message;
    var out = message;
    var lead =
      /^\s*((?:et\s+)?(?:alors\s+)?,?\s*)?(?:pour\s+finir|pour\s+terminer|pour\s+conclure|pour\s+clore|avant\s+de\s+conclure|en\s+conclusion|pour\s+boucler|pour\s+fermer(?:\s+l['']interview)?|enfin|une\s+derni[eè]re\s+question|dernier\s+point|derni[eè]re\s+chose|pour\s+terminer\s+sur\s+(?:une\s+)?note)\s*[,:\-–—]?\s*/i;
    var trimmed = out;
    var guard = 0;
    while (lead.test(trimmed) && guard < 3) {
      trimmed = trimmed.replace(lead, '');
      guard += 1;
    }
    trimmed = trimmed.replace(
      /^\s*([^?]{0,40}?)\b(?:une\s+)?derni[eè]re\s+question\s*[,:\-–—]\s*/i,
      function (_m, prefix) {
        return prefix && /\S/.test(prefix) ? prefix : '';
      }
    );

    // Soft yes/no due offers → direct ask (blank) or confirm a concrete day.
    var dueWhen = extractProposedDueWhen(trimmed);
    if (
      /je\s+peux\s+(?:d[eé]finir|fixer|mettre|ajouter).{0,40}(?:\u00e9ch[eé]ance|date\s+limite)/i.test(
        trimmed
      ) ||
      /je\s+m['']?\s*en\s+occupe/i.test(trimmed) ||
      /(?:souhaites?|voudr?[ae]|veux|aimerie[zs]|veux-tu|est-ce\s+que\s+tu\s+(?:veux|souhaites)).{0,40}(?:d[eé]finir|fixer|ajouter|mettre|avoir).{0,40}(?:\u00e9ch[eé]ance|date\s+limite)/i.test(
        trimmed
      ) ||
      /(?:y\s+a[- ]t[- ]il|est-ce\s+qu['']?il\s+y\s+a).{0,20}\u00e9ch[eé]ance/i.test(
        trimmed
      ) ||
      /d[eé]finir\s+une\s+\u00e9ch[eé]ance\s+pour\s+(?:cette\s+)?t[aâ]che/i.test(
        trimmed
      )
    ) {
      if (dueWhen) {
        return (
          'Veux-tu que je d\u00e9finisse l\'\u00e9ch\u00e9ance \u00e0 ' +
          dueWhen +
          '?'
        );
      }
      return 'Quelle est la date d\'\u00e9ch\u00e9ance?';
    }
    if (
      /(?:souhaites?|voudr?[ae]|veux|aimerie[zs]).{0,40}(?:d[eé]finir|estimer|avoir).{0,30}dur[eé]e/i.test(
        trimmed
      ) ||
      /(?:y\s+a[- ]t[- ]il|est-ce\s+qu['']?il\s+y\s+a).{0,20}dur[eé]e\s+estim/i.test(
        trimmed
      )
    ) {
      return 'Quelle est la dur\u00e9e estim\u00e9e?';
    }

    return trimmed
      .replace(/\s{2,}/g, ' ')
      .replace(/^\s*([a-zàâäéèêëïîôùûüç])/u, function (_m, ch) {
        return ch.toLocaleUpperCase('fr-FR');
      })
      .trim();
  }

  /** Pull a spoken due when (demain, aujourd'hui, …) from soft offer copy. */
  function extractProposedDueWhen(text) {
    if (typeof text !== 'string' || !text) return '';
    var m = text.match(
      /\b(?:aujourd['']hui|demain|apr[eè]s[- ]demain|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|\d{1,2}\s*(?:\/|-)\s*\d{1,2}(?:\s*(?:\/|-)\s*\d{2,4})?|\d{4}-\d{2}-\d{2})\b/i
    );
    if (!m) return '';
    var w = m[0];
    if (/^aujourd/i.test(w)) return 'aujourd\'hui';
    if (/^demain/i.test(w)) return 'demain';
    if (/^apr/i.test(w)) return 'apr\u00e8s-demain';
    return w.toLocaleLowerCase('fr-FR');
  }

  /**
   * The model sometimes emits cardPatches / patches as action tools.
   * Those are memory fields, not tools: fold them back so they apply.
   */
  function liftPatchTools(actions, cardPatches, boardPatches) {
    var kept = [];
    var cards = Array.isArray(cardPatches) ? cardPatches.slice() : [];
    var boards = Array.isArray(boardPatches) ? boardPatches.slice() : [];
    (actions || []).forEach(function (a) {
      if (!a || typeof a.tool !== 'string') {
        if (a) kept.push(a);
        return;
      }
      var tool = a.tool.trim();
      var rawArgs = a.args;
      if (tool === 'cardPatches' || tool === 'card_patches') {
        if (Array.isArray(rawArgs)) cards = cards.concat(rawArgs);
        else {
          var args = rawArgs && typeof rawArgs === 'object' ? rawArgs : {};
          if (Array.isArray(args.patches)) cards = cards.concat(args.patches);
          else if (Array.isArray(args.cardPatches)) cards = cards.concat(args.cardPatches);
          else if (args.op || args.text || args.query) cards.push(args);
        }
        return;
      }
      if (tool === 'patches' || tool === 'boardPatches' || tool === 'board_patches') {
        if (Array.isArray(rawArgs)) boards = boards.concat(rawArgs);
        else {
          var boardArgs = rawArgs && typeof rawArgs === 'object' ? rawArgs : {};
          if (Array.isArray(boardArgs.patches)) boards = boards.concat(boardArgs.patches);
          else if (boardArgs.op || boardArgs.text || boardArgs.query) boards.push(boardArgs);
        }
        return;
      }
      kept.push(a);
    });
    return { actions: kept, cardPatches: cards, patches: boards };
  }

  function normalizeCardPatches(raw) {
    var list = Array.isArray(raw) ? raw : [];
    var out = [];
    list.forEach(function (p) {
      if (!p || typeof p !== 'object') return;
      var op = String(p.op || '')
        .trim()
        .toLowerCase();
      if (op === 'remember' || op === 'note') {
        var text = typeof p.text === 'string' ? p.text.trim() : '';
        if (!text) return;
        out.push({ op: op === 'note' ? 'note' : 'remember', text: text.slice(0, 160) });
      } else if (op === 'forget') {
        var q =
          (typeof p.query === 'string' && p.query.trim()) ||
          (typeof p.text === 'string' && p.text.trim()) ||
          '';
        if (!q) return;
        out.push({ op: 'forget', query: q.slice(0, 120) });
      }
    });
    return out.slice(0, 4);
  }

  /** Board / project memory patches (long-term remember or short-term note). */
  function normalizeBoardPatches(raw) {
    var list = Array.isArray(raw) ? raw : [];
    var out = [];
    var allowed = {
      remember: true,
      remember_long: true,
      note: true,
      remember_short: true,
      forget: true,
      set_summary: true,
      set_board_summary: true
    };
    list.forEach(function (p) {
      if (!p || typeof p !== 'object') return;
      var op = String(p.op || '')
        .trim()
        .toLowerCase();
      if (!allowed[op]) return;
      if (op === 'forget') {
        var q =
          (typeof p.query === 'string' && p.query.trim()) ||
          (typeof p.text === 'string' && p.text.trim()) ||
          '';
        if (!q) return;
        out.push({ op: 'forget', query: q.slice(0, 120) });
        return;
      }
      if (op === 'set_summary' || op === 'set_board_summary') {
        var summary = typeof p.text === 'string' ? p.text.trim() : '';
        if (!summary) return;
        out.push({ op: op, text: summary.slice(0, 280) });
        return;
      }
      var text = typeof p.text === 'string' ? p.text.trim() : '';
      if (!text) return;
      out.push({
        op: op === 'remember_long' ? 'remember' : op === 'remember_short' ? 'note' : op,
        text: text.slice(0, 160)
      });
    });
    return out.slice(0, 4);
  }

  // exports
  S.ECHO_CONFIRM_STOPWORDS = ECHO_CONFIRM_STOPWORDS;
  S.applyInterviewEchoGuards = applyInterviewEchoGuards;
  S.applyProgressCompleteGuards = applyProgressCompleteGuards;
  S.contrastColorForPhrase = contrastColorForPhrase;
  S.ensureContrastHighlights = ensureContrastHighlights;
  S.ensurePriorityHighlights = ensurePriorityHighlights;
  S.ensureProgressCelebration = ensureProgressCelebration;
  S.ensureQuebecLibreEffect = ensureQuebecLibreEffect;
  S.ensureUnblockedIntent = ensureUnblockedIntent;
  S.escapeRegExp = escapeRegExp;
  S.extractHighlightSpans = extractHighlightSpans;
  S.extractProposedDueWhen = extractProposedDueWhen;
  S.filterDueSuggestionsWhenComplete = filterDueSuggestionsWhenComplete;
  S.foldEchoToken = foldEchoToken;
  S.highlightContentTokens = highlightContentTokens;
  S.isUnblockedReasonText = isUnblockedReasonText;
  S.liftPatchTools = liftPatchTools;
  S.linkSuggestionColorsToHighlights = linkSuggestionColorsToHighlights;
  S.looksLikeCongratulation = looksLikeCongratulation;
  S.looksLikeQuebecLibrePhrase = looksLikeQuebecLibrePhrase;
  S.looksLikeTitleEchoConfirmAsk = looksLikeTitleEchoConfirmAsk;
  S.looksLikeUnblockedPhrase = looksLikeUnblockedPhrase;
  S.normalizeBoardPatches = normalizeBoardPatches;
  S.normalizeCardPatches = normalizeCardPatches;
  S.normalizeHighlightMarkup = normalizeHighlightMarkup;
  S.overlapTokens = overlapTokens;
  S.polishAssistantVisibleText = polishAssistantVisibleText;
  S.polishMessageAfterProgressComplete = polishMessageAfterProgressComplete;
  S.rewriteWinkEmoticons = rewriteWinkEmoticons;
  S.stripEmDashes = stripEmDashes;
  S.stripInterviewConclusionFraming = stripInterviewConclusionFraming;
  S.stripScaleLegendParenthetical = stripScaleLegendParenthetical;
  S.stripSpaceBeforePunctuation = stripSpaceBeforePunctuation;
  S.suggestionMatchesHighlight = suggestionMatchesHighlight;
  S.titleTokenOverlapRatio = titleTokenOverlapRatio;
  S.tokenizeForEchoOverlap = tokenizeForEchoOverlap;
  S.trimHighlightLead = trimHighlightLead;
  S.wrapHighlightIfBare = wrapHighlightIfBare;
})(typeof window !== 'undefined' ? window : this);
