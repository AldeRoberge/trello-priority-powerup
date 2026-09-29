/**
 * Completion tree — subtask model + two renderers.
 * Exposes window.CompletionTree.
 *
 * Role: turns the flat Progrès data (card → subtasks → sub-subtasks, in
 * order) into something readable at a glance:
 *   - buildTreeModel        pure data → tree with statuses, order, "next step"
 *   - renderSummaryTree     compact read-only outline for the collapsed header
 *   - mountNodeView         interactive node flow (numbered steps, wires,
 *                           branches) used inside the expanded Progrès section
 * All mutations go through the `api` passed by CompletionUI, so persistence,
 * sounds and celebrations stay in one place.
 */
(function (global) {
  'use strict';

  var STATUS_LABEL = {
    done: 'Terminée',
    blocked: 'Bloquée',
    active: 'En cours',
    todo: 'À faire',
  };

  var SUMMARY_MAX_TOP = 6;
  var SUMMARY_MAX_NESTED = 3;

  function getCT(opts) {
    return (opts && opts.CT) || global.CompletionTrello || null;
  }

  function statusOf(progress, blocked) {
    if (blocked) return 'blocked';
    if (progress >= 100) return 'done';
    if (progress > 0) return 'active';
    return 'todo';
  }

  function formatMinutes(CT, minutes) {
    if (minutes == null || !CT || typeof CT.formatEstimatedMinutesCompact !== 'function') {
      return '';
    }
    return CT.formatEstimatedMinutesCompact(minutes) || '';
  }

  /**
   * Pure model. Returns
   * { text, percent, blocked, counts, minutesLeft, children: [node] }
   * node: { id, parentId, depth, order, text, progress, status, blocked,
   *         reasons, minutes, linked, linkedCardId, isNext, children }
   */
  function buildTreeModel(data, opts) {
    opts = opts || {};
    var CT = getCT(opts);
    var snaps = opts.linkedSnapshots || null;
    var items = data && Array.isArray(data.items) ? data.items : [];
    var counts = { total: 0, done: 0, blocked: 0, active: 0 };
    var minutesLeft = 0;
    var nextFound = false;

    var children = items.map(function (it, index) {
      var linked = CT.isLinkedItem(it);
      var progress = CT.itemProgress(it);
      var blocked = CT.isItemBlocked(it);
      var status = statusOf(progress, blocked);
      var minutes = CT.itemEstimatedMinutes(it, snaps);
      counts.total += 1;
      if (status === 'done') counts.done += 1;
      else if (status === 'blocked') counts.blocked += 1;
      else if (status === 'active') counts.active += 1;
      if (status !== 'done' && minutes != null) {
        minutesLeft += Math.round(minutes * (1 - progress / 100));
      }
      var isNext = false;
      if (!nextFound && status !== 'done' && status !== 'blocked') {
        isNext = true;
        nextFound = true;
      }
      var node = {
        id: it.id,
        parentId: null,
        depth: 1,
        order: index + 1,
        text: it.text || '',
        progress: progress,
        status: status,
        blocked: blocked,
        reasons: Array.isArray(it.blockedReasons) ? it.blockedReasons.slice() : [],
        minutes: minutes,
        linked: !!linked,
        linkedCardId: linked ? CT.itemLinkedCardId(it) : '',
        isNext: isNext,
        children: [],
      };
      if (!linked && Array.isArray(it.items)) {
        node.children = it.items.map(function (child, j) {
          var cp = CT.itemProgress(child);
          return {
            id: child.id,
            parentId: it.id,
            depth: 2,
            order: j + 1,
            text: child.text || '',
            progress: cp,
            status: statusOf(cp, false),
            blocked: false,
            reasons: [],
            minutes: CT.clampEstimatedMinutes(child.estimatedMinutes),
            linked: false,
            linkedCardId: '',
            isNext: false,
            children: [],
          };
        });
      }
      return node;
    });

    var percent = 0;
    try {
      percent = CT.computeCardProgress(data || { items: [] }, snaps).percent || 0;
    } catch (e) {
      percent = 0;
    }
    return {
      text: typeof opts.cardName === 'string' ? opts.cardName : '',
      percent: percent,
      blocked: !!(CT.hasAnyBlocked && data && CT.hasAnyBlocked(data)),
      counts: counts,
      minutesLeft: minutesLeft,
      children: children,
    };
  }

  // ── DOM helpers ───────────────────────────────────────────────────────

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function icon(name) {
    var i = document.createElement('i');
    i.className = 'ti ti-' + name;
    i.setAttribute('aria-hidden', 'true');
    return i;
  }

  function makeDot(status, progress) {
    var dot = el('span', 'ct-dot is-' + status);
    dot.style.setProperty('--p', String(progress));
    dot.setAttribute('aria-hidden', 'true');
    if (status === 'done') dot.appendChild(icon('check'));
    else if (status === 'blocked') dot.appendChild(icon('player-pause'));
    return dot;
  }

  function progressText(node) {
    if (node.status === 'done') return '';
    if (node.progress > 0) return node.progress + ' %';
    return '';
  }

  // ── Summary tree (collapsed header) ──────────────────────────────────

  /**
   * Compact read-only outline. Done subtasks collapse to one line, open ones
   * show their sub-subtasks. Returns null when there is nothing to show.
   */
  function renderSummaryTree(model, opts) {
    opts = opts || {};
    var CT = getCT(opts);
    if (!model || !model.children.length) return null;

    var wrap = el('div', 'ct-sum');
    wrap.setAttribute('role', 'group');
    wrap.setAttribute('aria-label', 'Résumé des sous-tâches');

    var head = el('div', 'ct-sum-head');
    var c = model.counts;
    head.appendChild(
      el('span', 'ct-sum-count', c.done + '/' + c.total + ' terminée' + (c.total > 1 ? 's' : ''))
    );
    if (c.blocked) {
      head.appendChild(
        el('span', 'ct-sum-flag is-blocked', c.blocked + ' bloquée' + (c.blocked > 1 ? 's' : ''))
      );
    }
    var left = formatMinutes(CT, model.minutesLeft || null);
    if (left) head.appendChild(el('span', 'ct-sum-left', left + ' restant'));
    wrap.appendChild(head);

    var list = el('ul', 'ct-sum-list');
    var shown = model.children.slice(0, SUMMARY_MAX_TOP);
    shown.forEach(function (node) {
      list.appendChild(summaryRow(node, CT, true));
    });
    if (model.children.length > shown.length) {
      var more = el('li', 'ct-sum-row ct-sum-more');
      more.appendChild(
        el('span', 'ct-sum-text', '+' + (model.children.length - shown.length) + ' autre(s)…')
      );
      list.appendChild(more);
    }
    wrap.appendChild(list);

    if (typeof opts.onOpen === 'function') {
      wrap.classList.add('is-clickable');
      wrap.addEventListener('click', function (event) {
        event.preventDefault();
        opts.onOpen();
      });
    }
    return wrap;
  }

  function summaryRow(node, CT, withChildren) {
    var li = el('li', 'ct-sum-row is-' + node.status + (node.isNext ? ' is-next' : ''));
    var line = el('div', 'ct-sum-line');
    line.appendChild(makeDot(node.status, node.progress));
    var text = el('span', 'ct-sum-text', node.text || 'Sans titre');
    text.title = node.text || '';
    line.appendChild(text);
    var meta = [];
    var pct = progressText(node);
    if (pct) meta.push(pct);
    var mins = formatMinutes(CT, node.minutes);
    if (mins && node.status !== 'done') meta.push(mins);
    if (meta.length) line.appendChild(el('span', 'ct-sum-meta', meta.join(' · ')));
    li.appendChild(line);
    if (node.status === 'blocked' && node.reasons.length) {
      var why = node.reasons[0];
      var whyText = typeof why === 'string' ? why : why && why.text ? why.text : '';
      if (whyText) li.appendChild(el('div', 'ct-sum-why', whyText));
    }
    if (withChildren && node.children.length && node.status !== 'done') {
      var sub = el('ul', 'ct-sum-list ct-sum-list--nested');
      node.children.slice(0, SUMMARY_MAX_NESTED).forEach(function (child) {
        sub.appendChild(summaryRow(child, CT, false));
      });
      if (node.children.length > SUMMARY_MAX_NESTED) {
        var more = el('li', 'ct-sum-row ct-sum-more');
        more.appendChild(
          el('span', 'ct-sum-text', '+' + (node.children.length - SUMMARY_MAX_NESTED) + '…')
        );
        sub.appendChild(more);
      }
      li.appendChild(sub);
    }
    return li;
  }

  // ── Node view (expanded Progrès) ─────────────────────────────────────

  /**
   * api: {
   *   CT, getData(), getCardName(), getLinkedSnapshots(),
   *   createEstimateChip(cfg), createBlockedMotif(cfg), onResize(),
   *   toggleDone(node, anchorRect), toggleBlocked(node), remove(node),
   *   add(parentId|null, text), move(node, dir), rename(node, text),
   *   setEstimate(node, minutes), setReasons(node, reasons), openLinked(cardId)
   * }
   */
  function mountNodeView(host, api) {
    var CT = api.CT || global.CompletionTrello;
    var root = el('div', 'ct-view');
    host.appendChild(root);

    var selectedId = '';
    var openAddFor = '';
    var pendingFocus = null; // { kind: 'root-add' | 'sub-add' | 'title', id }

    function nodeMeta(node) {
      var meta = el('div', 'ct-node-meta');
      var label = STATUS_LABEL[node.status];
      var status = el('span', 'ct-status is-' + node.status, label);
      meta.appendChild(status);
      if (node.status === 'active') {
        meta.appendChild(el('span', 'ct-pct', node.progress + ' %'));
      }
      if (node.linked) {
        var badge = el('span', 'ct-linked-badge');
        badge.appendChild(icon('link'));
        badge.appendChild(document.createTextNode('Carte liée'));
        meta.appendChild(badge);
      }
      var chip = api.createEstimateChip({
        minutes: node.minutes,
        readOnly: node.linked,
        ariaLabel: node.depth === 1 ? 'Estimation de la sous-tâche' : 'Estimation de la sous-sous-tâche',
        onChange: function (mins) {
          api.setEstimate(node, mins);
        },
      });
      if (chip && chip.el) {
        chip.el.classList.add('ct-estimate');
        meta.appendChild(chip.el);
      }
      return meta;
    }

    function actionBtn(name, label, handler, extraClass, pressed) {
      var btn = el('button', 'ct-act' + (extraClass ? ' ' + extraClass : ''));
      btn.type = 'button';
      btn.title = label;
      btn.setAttribute('aria-label', label);
      if (pressed != null) btn.setAttribute('aria-pressed', pressed ? 'true' : 'false');
      btn.appendChild(icon(name));
      btn.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        handler(btn);
      });
      return btn;
    }

    function buildNode(node, position) {
      var card = el(
        'div',
        'ct-node ct-node--d' + node.depth + ' is-' + node.status +
          (node.isNext ? ' is-next' : '') +
          (selectedId === node.id ? ' is-selected' : '')
      );
      card.dataset.id = node.id;
      if (node.parentId) card.dataset.parentId = node.parentId;
      card.appendChild(el('span', 'ct-port ct-port--in'));

      var head = el('div', 'ct-node-head');

      var ring = el('button', 'ct-ring is-' + node.status);
      ring.type = 'button';
      ring.style.setProperty('--p', String(node.progress));
      ring.setAttribute(
        'aria-label',
        node.linked
          ? 'Ouvrir la carte liée'
          : node.status === 'blocked'
            ? 'Débloquer'
            : node.status === 'done'
              ? 'Marquer comme non terminée'
              : 'Marquer comme terminée'
      );
      ring.title = ring.getAttribute('aria-label');
      if (node.status === 'done') ring.appendChild(icon('check'));
      else if (node.status === 'blocked') ring.appendChild(icon('player-pause'));
      else if (node.linked) ring.appendChild(icon('link'));
      ring.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        var rect = ring.getBoundingClientRect();
        api.toggleDone(node, {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        });
      });
      head.appendChild(ring);

      var title;
      if (node.linked) {
        title = el('button', 'ct-title ct-title--link', node.text);
        title.type = 'button';
        title.title = 'Ouvrir la carte liée';
        title.addEventListener('click', function () {
          api.openLinked(node.linkedCardId);
        });
      } else {
        title = el('input', 'ct-title');
        title.type = 'text';
        title.value = node.text;
        title.maxLength = 500;
        title.autocomplete = 'off';
        title.placeholder = node.depth === 1 ? 'Nouvelle sous-tâche…' : 'Sous-sous-tâche…';
        title.setAttribute(
          'aria-label',
          node.depth === 1 ? 'Texte de la sous-tâche' : 'Texte de la sous-sous-tâche'
        );
        title.addEventListener('focus', function () {
          selectedId = node.id;
          card.classList.add('is-selected');
        });
        title.addEventListener('keydown', function (event) {
          if (event.key === 'Enter') {
            event.preventDefault();
            title.blur();
          } else if (event.key === 'Escape') {
            title.value = node.text;
            title.blur();
          }
        });
        title.addEventListener('change', function () {
          var next = title.value.trim();
          if (!next) {
            title.value = node.text;
            return;
          }
          if (next !== node.text) api.rename(node, next);
        });
      }
      head.appendChild(title);

      if (node.isNext) {
        head.appendChild(el('span', 'ct-next-pill', 'Prochaine'));
      }

      var actions = el('div', 'ct-actions');
      if (node.depth === 1 && !node.linked) {
        actions.appendChild(
          actionBtn(
            'player-pause',
            node.status === 'blocked' ? 'Débloquer' : 'Marquer comme bloquée',
            function () {
              api.toggleBlocked(node);
            },
            'ct-act--block' + (node.status === 'blocked' ? ' is-on' : ''),
            node.status === 'blocked'
          )
        );
        actions.appendChild(
          actionBtn('subtask', 'Ajouter une sous-sous-tâche', function () {
            openAddFor = openAddFor === node.id ? '' : node.id;
            pendingFocus = openAddFor ? { kind: 'sub-add', id: node.id } : null;
            render();
          })
        );
      }
      actions.appendChild(
        actionBtn(
          'arrow-up',
          'Monter (faire plus tôt)',
          function () {
            api.move(node, -1);
          },
          position.first ? 'is-disabled' : ''
        )
      );
      actions.appendChild(
        actionBtn(
          'arrow-down',
          'Descendre (faire plus tard)',
          function () {
            api.move(node, 1);
          },
          position.last ? 'is-disabled' : ''
        )
      );
      actions.appendChild(
        actionBtn(
          'trash',
          node.linked ? 'Retirer le lien' : 'Supprimer',
          function () {
            api.remove(node);
          },
          'ct-act--danger'
        )
      );
      card.appendChild(head);
      var meta = nodeMeta(node);
      meta.appendChild(actions);
      card.appendChild(meta);

      if (node.status === 'blocked' && node.depth === 1 && api.createBlockedMotif) {
        var motif = api.createBlockedMotif({
          className: 'ct-motif',
          blockedReasons: node.reasons,
          onChange: function (reasons) {
            api.setReasons(node, reasons);
          },
        });
        if (motif && motif.el) card.appendChild(motif.el);
      }

      card.addEventListener('click', function (event) {
        if (event.target.closest('button, input, .ct-estimate, .ct-motif')) return;
        selectedId = selectedId === node.id ? '' : node.id;
        root.querySelectorAll('.ct-node.is-selected').forEach(function (n) {
          if (n !== card) n.classList.remove('is-selected');
        });
        card.classList.toggle('is-selected', selectedId === node.id);
      });
      return card;
    }

    function addGhost(placeholder, label, onAdd, focusKey) {
      var ghost = el('div', 'ct-node ct-node--ghost');
      ghost.appendChild(el('span', 'ct-port ct-port--in'));
      var ring = el('span', 'ct-ring ct-ring--ghost');
      ring.appendChild(icon('plus'));
      ghost.appendChild(ring);
      var input = el('input', 'ct-title ct-add-input');
      input.type = 'text';
      input.maxLength = 500;
      input.autocomplete = 'off';
      input.placeholder = placeholder;
      input.setAttribute('aria-label', label);
      input.dataset.focusKey = focusKey;
      function submit() {
        var text = input.value.trim();
        if (!text) return false;
        input.value = '';
        onAdd(text);
        return true;
      }
      input.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') {
          event.preventDefault();
          submit();
        } else if (event.key === 'Escape') {
          input.value = '';
          input.blur();
        }
      });
      var btn = el('button', 'ct-add-btn');
      btn.type = 'button';
      btn.setAttribute('aria-label', label);
      btn.title = label;
      btn.appendChild(icon('plus'));
      btn.addEventListener('click', function (event) {
        event.preventDefault();
        if (!submit()) input.focus();
      });
      ghost.appendChild(input);
      ghost.appendChild(btn);
      return { el: ghost, input: input };
    }

    function buildOverview(model) {
      var line = el('div', 'ct-overview');
      var c = model.counts;
      line.appendChild(
        el('span', 'ct-overview-main', c.done + '/' + c.total + ' étape' + (c.total > 1 ? 's' : '') + ' terminée' + (c.done > 1 ? 's' : ''))
      );
      if (c.blocked) {
        line.appendChild(el('span', 'ct-overview-flag', c.blocked + ' bloquée' + (c.blocked > 1 ? 's' : '')));
      }
      var left = formatMinutes(CT, model.minutesLeft || null);
      if (left) line.appendChild(el('span', 'ct-overview-left', left + ' restant'));
      return line;
    }

    function render() {
      var model = buildTreeModel(api.getData(), {
        CT: CT,
        cardName: api.getCardName(),
        linkedSnapshots: api.getLinkedSnapshots ? api.getLinkedSnapshots() : null,
      });
      root.replaceChildren();
      root.classList.toggle('is-empty', !model.children.length);

      if (model.children.length) root.appendChild(buildOverview(model));

      var steps = el('ol', 'ct-steps');
      var focusEl = null;

      model.children.forEach(function (node, index) {
        var step = el('li', 'ct-step is-' + node.status);
        step.appendChild(el('span', 'ct-num is-' + node.status, String(node.order)));
        step.appendChild(
          buildNode(node, { first: index === 0, last: index === model.children.length - 1 })
        );

        var showAdd = openAddFor === node.id && !node.linked;
        if (node.children.length || showAdd) {
          var branch = el('ol', 'ct-branch');
          node.children.forEach(function (child, j) {
            var sub = el('li', 'ct-sub is-' + child.status);
            sub.appendChild(
              buildNode(child, { first: j === 0, last: j === node.children.length - 1 })
            );
            branch.appendChild(sub);
          });
          if (showAdd) {
            var subGhost = addGhost(
              'Ajouter une sous-sous-tâche…',
              'Nouvelle sous-sous-tâche',
              function (text) {
                pendingFocus = { kind: 'sub-add', id: node.id };
                api.add(node.id, text);
              },
              'sub:' + node.id
            );
            subGhost.input.addEventListener('blur', function () {
              setTimeout(function () {
                if (openAddFor === node.id && !subGhost.input.value.trim() &&
                    document.activeElement !== subGhost.input) {
                  openAddFor = '';
                  render();
                  api.onResize();
                }
              }, 120);
            });
            var subLi = el('li', 'ct-sub ct-sub--add');
            subLi.appendChild(subGhost.el);
            branch.appendChild(subLi);
            if (pendingFocus && pendingFocus.kind === 'sub-add' && pendingFocus.id === node.id) {
              focusEl = subGhost.input;
            }
          }
          step.appendChild(branch);
        }
        var arrow = icon('chevron-down');
        arrow.classList.add('ct-arrow');
        step.appendChild(arrow);
        steps.appendChild(step);
      });

      var rootGhost = addGhost(
        model.children.length ? 'Ajouter une étape…' : 'Ajouter la première étape…',
        'Ajouter une sous-tâche',
        function (text) {
          pendingFocus = { kind: 'root-add' };
          api.add(null, text);
        },
        'root'
      );
      var addStep = el('li', 'ct-step ct-step--add');
      addStep.appendChild(el('span', 'ct-num ct-num--add', '+'));
      addStep.appendChild(rootGhost.el);
      steps.appendChild(addStep);
      if (pendingFocus && pendingFocus.kind === 'root-add') focusEl = rootGhost.input;

      root.appendChild(steps);

      if (focusEl) {
        var target = focusEl;
        pendingFocus = null;
        setTimeout(function () {
          try {
            target.focus();
          } catch (e) {
            /* ignore */
          }
        }, 0);
      }
    }

    render();
    return {
      el: root,
      render: render,
      focusAdd: function () {
        pendingFocus = { kind: 'root-add' };
        render();
      },
    };
  }

  global.CompletionTree = {
    STATUS_LABEL: STATUS_LABEL,
    statusOf: statusOf,
    buildTreeModel: buildTreeModel,
    renderSummaryTree: renderSummaryTree,
    mountNodeView: mountNodeView,
  };
})(typeof window !== 'undefined' ? window : this);
