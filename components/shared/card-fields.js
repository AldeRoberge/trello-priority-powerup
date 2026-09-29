/*
 * Role: shared, view-agnostic field editors for one Trello card (progress, priority, due dates,
 * blocked, rich-text description). Each editor opens as an anchored popover and reuses the same
 * mini editors as the card popup (PriorityUI.mountMini*, CompletionUI.mountMiniProgress), so the
 * Table, the Gantt and the card page all edit a card the same way.
 *
 *   CardFields.open('progress' | 'priority' | 'due' | 'blocked' | 'desc', {
 *     t, cardId, cardName, anchor,        // anchor: element the popover hangs from
 *     value, save,                        // 'desc' only: initial text + save(text) → Promise
 *     onSaved(kind), onError(message),    // optional feedback hooks
 *     onClose(changed),                   // optional; changed=true when something was saved
 *   })
 *   CardFields.close()
 *
 * Pure helpers (wrapSelection, formatLine) are exported for unit tests.
 */
(function (global) {
  'use strict';

  var current = null;

  function el(tag, cls, attrs) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'text') n.textContent = attrs[k];
        else n.setAttribute(k, attrs[k]);
      });
    }
    return n;
  }

  function msg(err) {
    return err && err.message ? err.message : String(err);
  }

  /* ── Pure text helpers (rich-text toolbar) ───────────────────────── */

  /** Wraps [start,end) of `text` with before/after (toggles when already wrapped). */
  function wrapSelection(text, start, end, before, after) {
    after = after == null ? before : after;
    var sel = text.slice(start, end);
    var b = text.slice(Math.max(0, start - before.length), start);
    var a = text.slice(end, end + after.length);
    if (b === before && a === after) {
      return {
        text: text.slice(0, start - before.length) + sel + text.slice(end + after.length),
        start: start - before.length,
        end: end - before.length,
      };
    }
    return {
      text: text.slice(0, start) + before + sel + after + text.slice(end),
      start: start + before.length,
      end: end + before.length,
    };
  }

  /** Prefixes each line touched by [start,end) with `prefix` (or numbers them when prefix is '1.'). */
  function formatLines(text, start, end, prefix) {
    var ls = text.lastIndexOf('\n', start - 1) + 1;
    var le = text.indexOf('\n', end);
    if (le < 0) le = text.length;
    var lines = text.slice(ls, le).split('\n');
    var allHave = lines.every(function (l) {
      return prefix === '1.' ? /^\d+\.\s/.test(l) : l.indexOf(prefix) === 0;
    });
    var out = lines.map(function (l, i) {
      if (prefix === '1.') return allHave ? l.replace(/^\d+\.\s/, '') : i + 1 + '. ' + l.replace(/^\d+\.\s/, '');
      return allHave ? l.slice(prefix.length) : prefix + l;
    });
    var joined = out.join('\n');
    return { text: text.slice(0, ls) + joined + text.slice(le), start: ls, end: ls + joined.length };
  }

  /* ── Popover shell ───────────────────────────────────────────────── */

  function position(pop, anchor) {
    var margin = 8;
    var r = anchor.getBoundingClientRect();
    pop.style.visibility = 'hidden';
    pop.style.left = '0px';
    pop.style.top = '0px';
    var pw = pop.offsetWidth || 320;
    var ph = pop.offsetHeight || 200;
    var vw = document.documentElement.clientWidth;
    var vh = document.documentElement.clientHeight;
    var left = Math.min(Math.max(margin, r.left), Math.max(margin, vw - pw - margin));
    var top = r.bottom + 6;
    if (top + ph > vh - margin) top = Math.max(margin, r.top - ph - 6);
    pop.style.left = Math.round(left) + 'px';
    pop.style.top = Math.round(top) + 'px';
    pop.style.visibility = '';
  }

  function close() {
    if (!current) return;
    var c = current;
    current = null;
    document.removeEventListener('keydown', c.onKey, true);
    document.removeEventListener('pointerdown', c.onOutside, true);
    if (c.api && typeof c.api.destroy === 'function') {
      try {
        c.api.destroy();
      } catch (e) {
        /* ignore */
      }
    }
    if (c.pop.parentNode) c.pop.parentNode.removeChild(c.pop);
    if (typeof c.opts.onClose === 'function') c.opts.onClose(c.changed);
  }

  function shell(title, opts) {
    close();
    var pop = el('div', 'cf-pop', { role: 'dialog', 'aria-label': title });
    var head = el('div', 'cf-pop-head');
    head.appendChild(el('div', 'cf-pop-title', { text: title }));
    if (opts.cardName) head.appendChild(el('div', 'cf-pop-card', { text: opts.cardName }));
    var x = el('button', 'cf-pop-close', { type: 'button', title: 'Fermer', 'aria-label': 'Fermer', text: '×' });
    x.addEventListener('click', close);
    head.appendChild(x);
    var body = el('div', 'cf-pop-body');
    pop.appendChild(head);
    pop.appendChild(body);
    document.body.appendChild(pop);

    var c = { pop: pop, body: body, opts: opts, api: null, changed: false };
    c.saved = function (kind) {
      c.changed = true;
      if (typeof opts.onSaved === 'function') opts.onSaved(kind);
    };
    c.fail = function (err) {
      if (typeof opts.onError === 'function') opts.onError(msg(err));
    };
    c.onKey = function (e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close();
      }
    };
    c.onOutside = function (e) {
      if (pop.contains(e.target)) return;
      if (opts.anchor && opts.anchor.contains && opts.anchor.contains(e.target)) return;
      if (e.target.closest && e.target.closest('.tp-context-menu')) return;
      close();
    };
    document.addEventListener('keydown', c.onKey, true);
    setTimeout(function () {
      if (current === c) document.addEventListener('pointerdown', c.onOutside, true);
    }, 0);
    current = c;
    position(pop, opts.anchor);
    return c;
  }

  function loading(c) {
    var n = el('div', 'cf-loading', { text: 'Chargement…' });
    c.body.appendChild(n);
    return n;
  }

  function guard(c, node) {
    return current === c && node.parentNode === c.body;
  }

  /* ── Editors ─────────────────────────────────────────────────────── */

  function openPriority(o) {
    var PT = global.PriorityTrello;
    var ui = global.PriorityUI;
    if (!PT || !ui || typeof ui.mountMiniPriority !== 'function') return o.onError && o.onError('Éditeur de priorité indisponible');
    var c = shell('Priorité', o);
    var ld = loading(c);
    Promise.all([
      PT.getCardInputsById(o.t, o.cardId),
      typeof PT.getBoardFormula === 'function' ? PT.getBoardFormula(o.t) : Promise.resolve('baseline'),
    ])
      .then(function (pair) {
        if (!guard(c, ld)) return;
        c.body.removeChild(ld);
        var mounted = ui.mountMiniPriority(c.body, {
          id: 'cf-' + o.cardId,
          formula: pair[1] || 'baseline',
          defaults: pair[0] || {},
          dimensions: PT.PRIORITY_DIMENSIONS,
          onStateChange: function (next) {
            PT.saveCardInputsById(o.t, o.cardId, { urgency: next.urgency, impact: next.impact, ease: next.ease }).then(
              function () {
                c.saved('priority');
              },
              c.fail
            );
          },
        });
        c.api = mounted;
        position(c.pop, o.anchor);
      })
      .catch(function (err) {
        ld.textContent = 'Erreur : ' + msg(err);
      });
  }

  function openDue(o) {
    var PT = global.PriorityTrello;
    var ui = global.PriorityUI;
    var GT = global.GanttTrello;
    if (!PT || !ui || typeof ui.mountMiniDue !== 'function') return o.onError && o.onError('Éditeur d’échéance indisponible');
    var c = shell('Échéance', o);
    var ld = loading(c);
    PT.getCardInputsById(o.t, o.cardId)
      .then(function (inputs) {
        if (!guard(c, ld)) return;
        c.body.removeChild(ld);
        c.api = ui.mountMiniDue(c.body, {
          value: inputs || {},
          onChange: function (v) {
            var chain = PT.saveCardInputsById(o.t, o.cardId, {
              dueDate: v.dueDate || '',
              dueTime: v.dueTime || '',
              dueEnabled: !!v.dueEnabled,
              dueMode: v.dueMode,
              dueVague: v.dueVague || '',
              startDate: v.startDate || '',
              recurrence: v.recurrence || null,
            });
            if (GT && typeof GT.saveCardDates === 'function') {
              chain = chain.then(function () {
                return GT.saveCardDates(o.t, o.cardId, { startDate: v.startDate || '', dueDate: v.dueDate || '', dueTime: v.dueTime || '' });
              });
            }
            chain.then(function () {
              c.saved('due');
            }, c.fail);
          },
        });
        position(c.pop, o.anchor);
      })
      .catch(function (err) {
        ld.textContent = 'Erreur : ' + msg(err);
      });
  }

  function openBlocked(o) {
    var PT = global.PriorityTrello;
    var ui = global.PriorityUI;
    if (!PT || !ui || typeof ui.mountMiniBlocked !== 'function') return o.onError && o.onError('Éditeur Bloqué indisponible');
    var c = shell('Bloqué', o);
    var ld = loading(c);
    PT.getCardInputsById(o.t, o.cardId)
      .then(function (inputs) {
        if (!guard(c, ld)) return;
        c.body.removeChild(ld);
        c.api = ui.mountMiniBlocked(c.body, {
          value: !!(inputs && inputs.enAttente),
          blockedReasons: (inputs && inputs.blockedReasons) || [],
          blockedLinks: (inputs && inputs.blockedLinks) || [],
          hideSubtaskPicker: true,
          onChange: function (next) {
            PT.saveCardInputsById(o.t, o.cardId, {
              enAttente: !!next.enAttente,
              blockedReasons: next.blockedReasons || [],
              blockedLinks: next.blockedLinks || [],
            }).then(function () {
              c.saved('blocked');
            }, c.fail);
          },
        });
        position(c.pop, o.anchor);
      })
      .catch(function (err) {
        ld.textContent = 'Erreur : ' + msg(err);
      });
  }

  function openProgress(o) {
    var CT = global.CompletionTrello;
    var CU = global.CompletionUI;
    if (!CT || !CU || typeof CU.mountMiniProgress !== 'function' || typeof CT.getCardCompletionById !== 'function') {
      return o.onError && o.onError('Éditeur de progrès indisponible');
    }
    var c = shell('Progrès', o);
    var ld = loading(c);
    CT.getCardCompletionById(o.t, o.cardId)
      .then(function (data) {
        if (!guard(c, ld)) return;
        c.body.removeChild(ld);
        c.api = CU.mountMiniProgress(c.body, {
          data: data || { items: [] },
          onChange: function (next) {
            CT.saveCardCompletionById(o.t, o.cardId, next).then(function () {
              c.saved('progress');
            }, c.fail);
          },
        });
        position(c.pop, o.anchor);
      })
      .catch(function (err) {
        ld.textContent = 'Erreur : ' + msg(err);
      });
  }

  var TOOLS = [
    { icon: 'bold', title: 'Gras (Ctrl+B)', run: function (v, s, e) { return wrapSelection(v, s, e, '**'); } },
    { icon: 'italic', title: 'Italique (Ctrl+I)', run: function (v, s, e) { return wrapSelection(v, s, e, '_'); } },
    { icon: 'strikethrough', title: 'Barré', run: function (v, s, e) { return wrapSelection(v, s, e, '~~'); } },
    { icon: 'code', title: 'Code', run: function (v, s, e) { return wrapSelection(v, s, e, '`'); } },
    { sep: true },
    { icon: 'heading', title: 'Titre', run: function (v, s, e) { return formatLines(v, s, e, '## '); } },
    { icon: 'list', title: 'Liste', run: function (v, s, e) { return formatLines(v, s, e, '- '); } },
    { icon: 'list-numbers', title: 'Liste numérotée', run: function (v, s, e) { return formatLines(v, s, e, '1.'); } },
    { icon: 'quote', title: 'Citation', run: function (v, s, e) { return formatLines(v, s, e, '> '); } },
    { icon: 'link', title: 'Lien (Ctrl+K)', run: function (v, s, e) {
      var sel = v.slice(s, e) || 'texte';
      var ins = '[' + sel + '](https://)';
      return { text: v.slice(0, s) + ins + v.slice(e), start: s + sel.length + 3, end: s + ins.length - 1 };
    } },
  ];

  function openDesc(o) {
    var c = shell('Description', o);
    c.pop.classList.add('cf-pop--wide');
    var value = o.value == null ? '' : String(o.value);
    var saved = value;
    var tabs = el('div', 'cf-tabs');
    var bar = el('div', 'cf-toolbar');
    var area = el('textarea', 'cf-textarea', { rows: '10', placeholder: 'Écrire en Markdown… (**gras**, _italique_, - liste, [lien](url))' });
    area.value = value;
    var preview = el('div', 'cf-preview agent-md');
    preview.hidden = true;
    var status = el('span', 'cf-hint', { text: 'Ctrl+Entrée pour enregistrer' });
    var saveBtn = el('button', 'cf-btn cf-btn--primary', { type: 'button', text: 'Enregistrer' });

    function apply(tool) {
      var r = tool.run(area.value, area.selectionStart, area.selectionEnd);
      area.value = r.text;
      area.focus();
      area.setSelectionRange(r.start, r.end);
    }
    TOOLS.forEach(function (tool) {
      if (tool.sep) return bar.appendChild(el('span', 'cf-sep'));
      var b = el('button', 'cf-tool', { type: 'button', title: tool.title, 'aria-label': tool.title });
      b.appendChild(el('i', 'ti ti-' + tool.icon));
      b.addEventListener('mousedown', function (e) { e.preventDefault(); });
      b.addEventListener('click', function () { apply(tool); });
      bar.appendChild(b);
    });

    function showPreview(on) {
      preview.hidden = !on;
      area.hidden = on;
      bar.classList.toggle('is-disabled', on);
      writeTab.classList.toggle('is-on', !on);
      viewTab.classList.toggle('is-on', on);
      if (on) {
        preview.textContent = '';
        if (global.MarkdownDom && area.value.trim()) global.MarkdownDom.append(preview, area.value);
        else preview.appendChild(el('div', 'cf-empty', { text: 'Rien à prévisualiser.' }));
      } else area.focus();
      position(c.pop, o.anchor);
    }
    var writeTab = el('button', 'cf-tab is-on', { type: 'button', text: 'Écrire' });
    var viewTab = el('button', 'cf-tab', { type: 'button', text: 'Aperçu' });
    writeTab.addEventListener('click', function () { showPreview(false); });
    viewTab.addEventListener('click', function () { showPreview(true); });
    tabs.appendChild(writeTab);
    tabs.appendChild(viewTab);

    function commit() {
      if (area.value === saved) return close();
      saveBtn.disabled = true;
      status.textContent = 'Enregistrement…';
      Promise.resolve(o.save(area.value)).then(
        function () {
          saved = area.value;
          c.saved('desc');
          close();
        },
        function (err) {
          saveBtn.disabled = false;
          status.textContent = '';
          c.fail(err);
        }
      );
    }
    saveBtn.addEventListener('click', commit);
    area.addEventListener('keydown', function (e) {
      var mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === 'Enter') { e.preventDefault(); commit(); }
      else if (mod && (e.key === 'b' || e.key === 'B')) { e.preventDefault(); apply(TOOLS[0]); }
      else if (mod && (e.key === 'i' || e.key === 'I')) { e.preventDefault(); apply(TOOLS[1]); }
      else if (mod && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); apply(TOOLS[TOOLS.length - 1]); }
    });

    var foot = el('div', 'cf-foot');
    foot.appendChild(status);
    var cancel = el('button', 'cf-btn', { type: 'button', text: 'Annuler' });
    cancel.addEventListener('click', close);
    foot.appendChild(cancel);
    foot.appendChild(saveBtn);
    var head = el('div', 'cf-editor-head');
    head.appendChild(tabs);
    head.appendChild(bar);
    c.body.appendChild(head);
    c.body.appendChild(area);
    c.body.appendChild(preview);
    c.body.appendChild(foot);
    position(c.pop, o.anchor);
    area.focus();
    area.setSelectionRange(area.value.length, area.value.length);
  }

  var OPENERS = { progress: openProgress, priority: openPriority, due: openDue, blocked: openBlocked, desc: openDesc };

  function open(kind, opts) {
    opts = opts || {};
    var fn = OPENERS[kind];
    if (!fn || !opts.anchor) return false;
    if (kind !== 'desc' && (!opts.t || !opts.cardId)) return false;
    if (kind === 'desc' && typeof opts.save !== 'function') return false;
    fn(opts);
    return true;
  }

  global.CardFields = {
    open: open,
    close: close,
    isOpen: function () { return !!current; },
    KINDS: Object.keys(OPENERS),
    wrapSelection: wrapSelection,
    formatLines: formatLines,
  };
})(typeof window !== 'undefined' ? window : this);
