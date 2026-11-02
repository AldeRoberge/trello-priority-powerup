/**
 * Chat UI for the Cerveau assistant (card popup + project window).
 * Exposes window.AgentUI.mount(cardEl, options).
 *
 * Role: DOM only. All LLM / Trello work goes through PriorityAgent + bridges
 * passed in options. Safe rendering: textContent + AgentBlocks; highlight
 * markup is [[g:…]] / [[a:…]] etc., never raw HTML from the model.
 *
 * mount(cardEl, options) returns a controller { destroy, … }.
 * loadingFrame / mountLoading: staged wait (prepare, send, read, write).
 *
 * Table of contents (inside mount closure)
 * ────────────────────────────────────────
 *  1.  DOM helpers, FR count words, highlight / block renderers
 *      (+ attachOptionalBridgeFns for page Trello helpers)
 *  2.  Session state (modelTier, messageQueue, listen-scan, dream)
 *  3.  Settings panel (provider presets, verify, memory, statistiques)
 *  4.  Chat panel chrome (composer, TabAutocomplete, collapse, debug)
 *  5.  Face / aura / emotion (UserProfile) + point-at glove overlays
 *  6.  Message list render + streaming finalize
 *  7.  sendUserMessage / turn pipeline / action confirmations
 *  8.  Coup de pouce listen-scan + suggestion chips
 *  9.  Public controller API returned from mount
 */
(function (global) {
  'use strict';

  var S = (global.AgentUiParts = global.AgentUiParts || {});

  function dbg() {
    return global.TpDebug || null;
  }
  function dbgLog(domain, event, meta) {
    var d = dbg();
    if (d && d.log) d.log(domain, event, meta);
  }
  function dbgError(domain, event, err, meta) {
    var d = dbg();
    if (d && d.error) d.error(domain, event, err, meta);
    else if (err) console.error(domain + '.' + event, err);
  }

  /**
   * Page bridges (popup.html) pass Trello helpers as mount options. The mount
   * facade must forward them or buildContext / executeActions never see them
   * (e.g. getCardLabels → context.labels stays empty → AI invents "no labels").
   *
   * Strategy: copy every function option onto the bridge except UI-only
   * callbacks. A denylist beats a whitelist so new page helpers cannot be
   * forgotten again.
   */
  var BRIDGE_UI_ONLY_OPTIONS = {
    onLayoutChange: true,
    onExpandChange: true,
    onMemoryUpdate: true,
    onCardMemoryUpdate: true,
    /** Used via options.applyPeople inside upsertPerson / removePerson. */
    applyPeople: true
  };

  /** Documented page helpers (kept for tests / grepping; forwarding is denylist). */
  var OPTIONAL_BRIDGE_FNS = [
    'getCardLabels',
    'getBoardLabels',
    'loadCardLabels',
    'loadBoardLabels',
    'loadCardMembers',
    'addLabel',
    'removeLabel',
    'createLabel',
    'getBoardMembers',
    'loadBoardMembers',
    'addMember',
    'removeMember',
    'setCustomAssignees',
    'setMemberRoles',
    'getHistory',
    'historyUndo',
    'historyRedo',
    'historyRevert',
    'getOwnership',
    'getGoals',
    'setProject',
    'selectStatut',
    'getCustomAssigneeCatalog',
    'upsertCustomAssigneeCatalog',
    'pointAt',
    'resolvePointTarget',
    'refreshBoardDigest',
    'refreshPeople'
  ];

  function attachOptionalBridgeFns(bridge, options) {
    if (!bridge || !options) return bridge;
    Object.keys(options).forEach(function (name) {
      if (BRIDGE_UI_ONLY_OPTIONS[name]) return;
      if (typeof options[name] !== 'function') return;
      bridge[name] = options[name];
    });
    return bridge;
  }

  /**
   * Refresh Trello caches the page keeps for buildContext (labels, members).
   * Safe no-op when loaders are absent (project assistant).
   */
  function hydrateBridgeCaches(bridge) {
    if (!bridge) return Promise.resolve();
    var jobs = [];
    function pushLoad(name) {
      if (typeof bridge[name] !== 'function') return;
      jobs.push(
        Promise.resolve(bridge[name]({ force: true })).catch(function () {
          /* keep prior cache */
        })
      );
    }
    pushLoad('loadCardLabels');
    pushLoad('loadBoardLabels');
    pushLoad('loadCardMembers');
    pushLoad('loadBoardMembers');
    return jobs.length ? Promise.all(jobs) : Promise.resolve();
  }

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

  /** French count words for short UI labels (1–16); falls back to digits. */
  var FR_COUNT_WORDS = [
    '',
    'Une',
    'Deux',
    'Trois',
    'Quatre',
    'Cinq',
    'Six',
    'Sept',
    'Huit',
    'Neuf',
    'Dix',
    'Onze',
    'Douze',
    'Treize',
    'Quatorze',
    'Quinze',
    'Seize'
  ];

  function formatFrCountLabel(n, singular, plural) {
    var count = Math.max(0, Number(n) || 0);
    var word = FR_COUNT_WORDS[count] || String(count);
    return word + ' ' + (count === 1 ? singular : plural);
  }

  /**
   * Repair common model typos before rendering:
   * whitespace around [[g:…]], uppercase colors, single closing ].
   */
  function normalizeHighlightMarkup(text) {
    if (typeof text !== 'string' || !text) return text || '';
    return text
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

  /** Hide a trailing unfinished [[g:… / [[a:… marker so streaming does not flash raw syntax. */
  function hideIncompleteHighlightMarker(text) {
    if (typeof text !== 'string' || !text) return text || '';
    var lastOpen = text.lastIndexOf('[[');
    if (lastOpen === -1) {
      if (text.charAt(text.length - 1) === '[') return text.slice(0, -1);
      return text;
    }
    var after = text.slice(lastOpen);
    // Complete [[color:phrase]] — keep (even if more text follows).
    if (/^\[\[[grya]:[^\]]{1,120}\]\]/i.test(after)) return text;
    // Highlight-shaped but unfinished (incl. single ]) — hide until closed.
    if (
      after === '[[' ||
      /^\[\[[grya]?(?::[^\]]*)?\]?$/i.test(after) ||
      /^\[\[[grya]:/i.test(after)
    ) {
      return text.slice(0, lastOpen);
    }
    return text;
  }

  /** Strip leftover highlight syntax so users never see [[g:…]]. */
  function stripLeftoverHighlightMarkup(text) {
    if (typeof text !== 'string' || !text) return text || '';
    return text
      .replace(/\[\[\s*[grya]\s*:\s*([^\]]{0,120}?)\s*\]\]?/gi, '$1')
      .replace(/\[\[\s*[grya]?\s*:?\s*[^\]]{0,120}$/gi, '')
      .replace(/\[\[[^\]]*$/g, '');
  }

  /**
   * Render assistant text with optional highlights:
   * [[g:/r:/y:]] = semantic priority colors; [[a:]] = agent identity accent.
   * Safe: every phrase is textContent; no HTML from the model.
   */
  function appendHighlightedFragment(parent, text) {
    if (!parent || text == null || text === '') return;
    var display = typeof text === 'string' ? text : '';
    if (!display) return;
    var re = /\[\[([grya]):([^\]]{1,120})\]\]/gi;
    var last = 0;
    var m;
    var hasHighlight = false;
    while ((m = re.exec(display)) !== null) {
      hasHighlight = true;
      if (m.index > last) {
        parent.appendChild(
          document.createTextNode(
            stripLeftoverHighlightMarkup(display.slice(last, m.index))
          )
        );
      }
      var span = document.createElement('span');
      span.className = 'agent-hl agent-hl--' + String(m[1]).toLowerCase();
      span.textContent = m[2];
      parent.appendChild(span);
      last = m.index + m[0].length;
    }
    if (!hasHighlight) {
      parent.appendChild(
        document.createTextNode(stripLeftoverHighlightMarkup(display))
      );
      return;
    }
    if (last < display.length) {
      parent.appendChild(
        document.createTextNode(
          stripLeftoverHighlightMarkup(display.slice(last))
        )
      );
    }
  }

  /** Markdown (shared renderer) with [[g:]] highlights inside inline text. */
  function appendMarkdownFragment(parent, text) {
    if (typeof MarkdownDom === 'undefined') {
      appendHighlightedFragment(parent, text);
      return;
    }
    MarkdownDom.append(parent, text, appendHighlightedFragment);
  }

  function fillHighlightedBubble(bubble, text) {
    if (!bubble) return;
    bubble.replaceChildren();
    var raw = typeof text === 'string' ? text : '';
    var display = hideIncompleteHighlightMarker(normalizeHighlightMarkup(raw));
    if (!display) return;
    appendMarkdownFragment(bubble, display);
  }

  /** Highlights + optional {{n}} visual blocks (AgentBlocks). */
  function fillMessageContent(bubble, text, blocks, options) {
    options = options || {};
    if (
      typeof AgentBlocks !== 'undefined' &&
      typeof AgentBlocks.fillMessageContent === 'function'
    ) {
      AgentBlocks.fillMessageContent(bubble, text, blocks || [], {
        streaming: !!options.streaming,
        highlight: {
          normalize: normalizeHighlightMarkup,
          hideIncomplete: hideIncompleteHighlightMarker,
          stripLeftover: stripLeftoverHighlightMarkup,
          appendHighlighted: appendMarkdownFragment
        }
      });
      return;
    }
    fillHighlightedBubble(bubble, text);
  }

    function statusIcon(status) {
      if (status === 'pass') return '\u2713';
      if (status === 'fail') return '\u2717';
      if (status === 'warn') return '!';
      if (status === 'running') return '\u2026';
      return '\u2013';
    }

  // ── mount() — builds settings + chat panels into cardEl ──────────────────

  var CHATS_OPEN_STORAGE_KEY = 'trello-priority-powerup/assistant-chats-open';

  function mount(cardEl, options) {
    var M = Object.create(null);
    M.cardEl = cardEl;
    M.options = options;
    var __parts = (global.AgentUiPartsMountMount || { list: [] }).list;
    for (var __i = 0; __i < __parts.length; __i++) __parts[__i].define(M);
    for (var __j = 0; __j < __parts.length; __j++) {
      var __r = __parts[__j].run(M);
      if (__r) return __r.v;
    }
  }

  var LOAD_PHASES = [
    { id: 'prepare', label: 'Pr\u00e9paration', icon: 'ti-stack-2', detail: 'Cartes et contexte', at: 0.12 },
    { id: 'send', label: 'Envoi de la demande', icon: 'ti-send', detail: 'Le mod\u00e8le r\u00e9pond', at: 0.36 },
    { id: 'read', label: 'Lecture de la r\u00e9ponse', icon: 'ti-book', detail: 'Mise en forme', at: 0.8 },
    { id: 'write', label: '\u00c9criture', icon: 'ti-pencil', detail: 'Cartes mises \u00e0 jour', at: 0.92 }
  ];

  function loadingFrame(phase, elapsedMs, estimateMs, phaseIds) {
    var list = LOAD_PHASES;
    if (phaseIds && phaseIds.length) {
      list = LOAD_PHASES.filter(function (p) {
        return phaseIds.indexOf(p.id) !== -1;
      });
    }
    if (!list.length) list = LOAD_PHASES;
    var idx = 0;
    var i;
    for (i = 0; i < list.length; i++) {
      if (list[i].id === phase) idx = i;
    }
    var cur = list[idx];
    var nextAt = idx + 1 < list.length ? list[idx + 1].at : 0.97;
    var elapsed = Math.max(0, Number(elapsedMs) || 0);
    var estimate = estimateMs > 400 ? estimateMs : 8000;
    var creep = elapsed / estimate;
    if (creep > 1) creep = 1;
    var pct = Math.round((cur.at + (nextAt - cur.at) * creep) * 100);
    if (pct < 4) pct = 4;
    if (pct > 96) pct = 96;
    var left = estimate - elapsed;
    var timeLabel = left > 500
      ? '\u2248 ' + Math.ceil(left / 1000) + ' s'
      : Math.max(1, Math.ceil(elapsed / 1000)) + ' s';
    return {
      phase: cur.id,
      label: cur.label,
      icon: cur.icon,
      detail: cur.detail,
      percent: pct,
      timeLabel: timeLabel,
      steps: list.map(function (p, n) {
        return {
          id: p.id,
          label: p.label,
          icon: p.icon,
          state: n < idx ? 'done' : n === idx ? 'now' : 'wait'
        };
      })
    };
  }

  function mountLoading(parent, options) {
    options = options || {};
    var doc = global.document;
    if (!parent || !doc) {
      return {
        setPhase: function () {},
        stop: function () {},
        elapsed: function () { return 0; }
      };
    }
    var ids = options.phases || ['prepare', 'send', 'read'];
    var estimate = options.estimateMs > 400 ? options.estimateMs : 8000;
    var phase = options.phase || ids[0];
    var t0 = Date.now();
    var root = doc.createElement('div');
    root.className = 'ai-status';
    root.setAttribute('role', 'status');
    root.setAttribute('aria-live', 'polite');
    var head = doc.createElement('div');
    head.className = 'ai-status-head';
    var label = doc.createElement('span');
    label.className = 'ai-status-label';
    var steps = doc.createElement('ol');
    steps.className = 'ai-status-steps';
    var time = doc.createElement('span');
    time.className = 'ai-status-time';
    head.appendChild(steps);
    head.appendChild(time);
    var track = doc.createElement('div');
    track.className = 'ai-status-track';
    track.setAttribute('role', 'progressbar');
    track.setAttribute('aria-valuemin', '0');
    track.setAttribute('aria-valuemax', '100');
    var bar = doc.createElement('span');
    bar.className = 'ai-status-bar';
    track.appendChild(bar);
    var detail = doc.createElement('p');
    detail.className = 'ai-status-detail';
    root.appendChild(label);
    root.appendChild(head);
    root.appendChild(track);
    root.appendChild(detail);
    parent.appendChild(root);
    function draw() {
      var view = loadingFrame(phase, Date.now() - t0, estimate, ids);
      label.textContent = view.label;
      time.textContent = view.timeLabel;
      bar.style.width = view.percent + '%';
      track.setAttribute('aria-valuenow', String(view.percent));
      track.setAttribute('aria-label', view.label);
      detail.textContent = view.detail;
      steps.textContent = '';
      view.steps.forEach(function (step) {
        var li = doc.createElement('li');
        li.className = 'ai-status-step is-' + step.state;
        li.title = step.label;
        var icon = doc.createElement('i');
        icon.className = 'ti ' + step.icon;
        icon.setAttribute('aria-hidden', 'true');
        li.appendChild(icon);
        steps.appendChild(li);
      });
    }
    draw();
    var timer = setInterval(function () {
      if (!root.isConnected) {
        clearInterval(timer);
        return;
      }
      draw();
    }, 250);
    return {
      setPhase: function (id) {
        phase = id;
        draw();
      },
      elapsed: function () { return Date.now() - t0; },
      stop: function () {
        clearInterval(timer);
        if (root.parentNode) root.parentNode.removeChild(root);
      }
    };
  }

  global.AgentUI = {
    mount: mount,
    loadingFrame: loadingFrame,
    mountLoading: mountLoading,
    /** @internal exposed for unit tests */
    attachOptionalBridgeFns: attachOptionalBridgeFns,
    hydrateBridgeCaches: hydrateBridgeCaches,
    OPTIONAL_BRIDGE_FNS: OPTIONAL_BRIDGE_FNS,
    BRIDGE_UI_ONLY_OPTIONS: BRIDGE_UI_ONLY_OPTIONS
  };

  // shared with the mount parts
  S.BRIDGE_UI_ONLY_OPTIONS = BRIDGE_UI_ONLY_OPTIONS;
  S.CHATS_OPEN_STORAGE_KEY = CHATS_OPEN_STORAGE_KEY;
  S.FR_COUNT_WORDS = FR_COUNT_WORDS;
  S.LOAD_PHASES = LOAD_PHASES;
  S.OPTIONAL_BRIDGE_FNS = OPTIONAL_BRIDGE_FNS;
  S.appendHighlightedFragment = appendHighlightedFragment;
  S.appendMarkdownFragment = appendMarkdownFragment;
  S.attachOptionalBridgeFns = attachOptionalBridgeFns;
  S.dbg = dbg;
  S.dbgError = dbgError;
  S.dbgLog = dbgLog;
  S.el = el;
  S.fillHighlightedBubble = fillHighlightedBubble;
  S.fillMessageContent = fillMessageContent;
  S.formatFrCountLabel = formatFrCountLabel;
  S.hideIncompleteHighlightMarker = hideIncompleteHighlightMarker;
  S.hydrateBridgeCaches = hydrateBridgeCaches;
  S.loadingFrame = loadingFrame;
  S.mount = mount;
  S.mountLoading = mountLoading;
  S.normalizeHighlightMarkup = normalizeHighlightMarkup;
  S.statusIcon = statusIcon;
  S.stripLeftoverHighlightMarkup = stripLeftoverHighlightMarkup;
})(typeof window !== 'undefined' ? window : this);
