/**
 * docs-ui: mount() part 5 of 6.
 * The body of mount runs in order across these parts; its locals live on the per-call state object (M).
 * Order and shared names: see docs-ui.parts.json and docs/architecture.md.
 */
(function (global) {
  'use strict';

  var S = (global.DocsUiParts = global.DocsUiParts || {});
  var P = (global.DocsUiPartsMountMount = global.DocsUiPartsMountMount || { list: [] });

  P.list.push({
    define: function (M) {
    M.paintSlice = function paintSlice(node, start, end, kind, name) {
      var text = M.isolateText(node, start, end);
      var host = M.inkHost(text, kind);
      if (!name) {
        if (!host) return text;
        if (host.textContent === text.nodeValue) {
          M.unwrapEl(host);
          return text;
        }
        return M.pullOut(text, host);
      }
      if (host && host.textContent === text.nodeValue) {
        host.setAttribute('data-c', name);
        if (kind === 'c') host.classList.add('dc-ink');
        return text;
      }
      var el = document.createElement(kind === 'h' ? 'mark' : 'span');
      if (kind === 'c') el.className = 'dc-ink';
      el.setAttribute('data-c', name);
      text.parentNode.insertBefore(el, text);
      el.appendChild(text);
      return text;
    };
    M.applyInk = function applyInk(kind, name) {
      if (!M.editor) return;
      var range = M.liveSelectionRange();
      if (!range && M.lastRange && M.editor.contains(M.lastRange.startContainer)) {
        var sel0 = global.getSelection();
        sel0.removeAllRanges();
        try { sel0.addRange(M.lastRange); } catch (e0) { return; }
        range = M.liveSelectionRange();
      }
      if (!range) return;
      var now = kind === 'h' ? M.inkHere().hi : M.inkHere().color;
      var next = name && now === name ? '' : (name || '');
      var slices = M.slicesInRange(range);
      if (!slices.length) return;
      var first = null;
      var last = null;
      var i;
      for (i = slices.length - 1; i >= 0; i--) {
        var piece = M.paintSlice(slices[i].node, slices[i].start, slices[i].end, kind, next);
        if (piece && piece.nodeType === 3) {
          if (!last) last = piece;
          first = piece;
        }
      }
      if (first && last && last.nodeValue != null) {
        var sel = global.getSelection();
        var r = document.createRange();
        try {
          r.setStart(first, 0);
          r.setEnd(last, last.nodeValue.length);
          sel.removeAllRanges();
          sel.addRange(r);
        } catch (e1) { /* the nodes moved */ }
        M.saveSel();
      }
      M.onEdit();
      M.paintToolbarState();
    };
    M.paintSelBarState = function paintSelBarState() {
      if (!M.selBar) return;
      var n = M.selNode();
      var inEditor = !!n;
      function q(cmd) {
        try { return inEditor && document.queryCommandState(cmd); } catch (e) { return false; }
      }
      var li = inEditor && M.closestIn(n, 'LI');
      var list = li && li.parentNode;
      var states = {
        bold: q('bold'),
        italic: q('italic'),
        underline: q('underline'),
        strike: q('strikeThrough'),
        code: inEditor && !!M.closestIn(n, 'CODE'),
        link: inEditor && !!M.closestIn(n, 'A'),
        ul: !!list && list.tagName === 'UL' && !list.classList.contains('dc-todo'),
        ol: !!list && list.tagName === 'OL',
      };
      Array.prototype.forEach.call(M.selBar.querySelectorAll('[data-cmd]'), function (b) {
        var cmd = b.getAttribute('data-cmd');
        if (!Object.prototype.hasOwnProperty.call(states, cmd)) return;
        var on = !!states[cmd];
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      var label = M.selBar.querySelector('.dc-selbar-style-label');
      if (label) label.textContent = M.STYLE_LABEL[M.blockType()] || 'Texte';
      var ink = M.inkHere();
      var sw = null;
      M.SEL_INKS.forEach(function (c) { if (c.id === ink.color) sw = c; });
      var stripe = M.selBar.querySelector('.dc-selbar-a-bar');
      if (stripe) stripe.style.background = sw ? sw.fg : 'currentColor';
    };
    M.openStyleMenu = function openStyleMenu(anchor) {
      if (M.pop && M.pop.classList.contains('dc-style-pop')) {
        M.closePop();
        return;
      }
      M.holdSelection();
      M.closePop();
      var cur = M.blockType();
      if (cur === 'codeblock') cur = 'p';
      var rows = [['p', 'Texte', 'pilcrow'], ['h1', 'Titre 1', 'h-1'], ['h2', 'Titre 2', 'h-2'], ['h3', 'Titre 3', 'h-3']];
      M.pop = S.h('div', { class: 'dc-pop dc-menu dc-sel-pop dc-style-pop', role: 'menu' }, rows.map(function (row) {
        return S.h('button', {
          class: 'dc-menu-item' + (cur === row[0] ? ' is-on' : ''),
          type: 'button',
          onmousedown: function (e) { e.preventDefault(); M.holdSelection(); },
          onclick: function () {
            M.closePop();
            M.runCommand(row[0], { force: true });
          },
        }, [S.icon(row[2]), S.h('span', { text: row[1] })]);
      }));
      M.placePop(M.pop, anchor.getBoundingClientRect());
    };
    M.openSelMore = function openSelMore(anchor) {
      if (M.pop && M.pop.classList.contains('dc-more-pop')) {
        M.closePop();
        return;
      }
      M.holdSelection();
      M.closePop();
      var rows = [['code', 'code', 'Code'], ['quote', 'quote', 'Citation'], ['todo', 'list-check', 'Liste de tâches']];
      M.pop = S.h('div', { class: 'dc-pop dc-menu dc-sel-pop dc-more-pop', role: 'menu' }, rows.map(function (row) {
        return S.h('button', {
          class: 'dc-menu-item',
          type: 'button',
          onmousedown: function (e) { e.preventDefault(); M.holdSelection(); },
          onclick: function () {
            M.closePop();
            M.runCommand(row[0]);
          },
        }, [S.icon(row[1]), S.h('span', { text: row[2] })]);
      }));
      M.placePop(M.pop, anchor.getBoundingClientRect());
    };
    M.inkSwatch = function inkSwatch(kind, id, bg, label, current) {
      return S.h('button', {
        class: 'dc-swatch' + (!id ? ' dc-swatch--none' : '') + (current && current === id ? ' is-on' : ''),
        type: 'button',
        title: label,
        'aria-label': label,
        'data-ink': id || 'none',
        style: bg ? 'background:' + bg : '',
        onmousedown: function (e) { e.preventDefault(); M.holdSelection(); },
        onclick: function () {
          M.applyInk(kind, id);
          M.closePop();
        },
      });
    };
    M.openInkPopover = function openInkPopover(anchor) {
      if (M.pop && M.pop.classList.contains('dc-ink-pop')) {
        M.closePop();
        return;
      }
      M.holdSelection();
      M.closePop();
      var ink = M.inkHere();
      function row(kind, current) {
        var buttons = [M.inkSwatch(kind, '', '', 'Aucune', current)];
        M.SEL_INKS.forEach(function (c) {
          buttons.push(M.inkSwatch(kind, c.id, kind === 'h' ? c.bg : c.fg, c.label, current));
        });
        return S.h('div', { class: 'dc-ink-row' }, buttons);
      }
      M.pop = S.h('div', { class: 'dc-pop dc-ink-pop dc-sel-pop' }, [
        S.h('div', { class: 'dc-ink-label', text: 'Texte' }),
        row('c', ink.color),
        S.h('div', { class: 'dc-ink-label', text: 'Surlignage' }),
        row('h', ink.hi),
      ]);
      M.placePop(M.pop, anchor.getBoundingClientRect());
    };
    M.projectHere = function projectHere() {
      var cur = M.state.current;
      var id = cur && cur.id;
      var hops = 0;
      var parents = (M.state.idx && M.state.idx.parents) || {};
      while (id && hops++ < 30) {
        var d = id === cur.id ? cur : (M.state.docs || []).filter(function (x) { return x.id === id; })[0];
        if (d && d.subject && d.subject.k === 'project') return d.subject.id;
        id = parents[id];
      }
      return '';
    };
    M.createTaskFromSelection = function createTaskFromSelection(listId) {
      var range = M.liveSelectionRange() || (M.heldRange && M.editor && M.editor.contains(M.heldRange.startContainer) ? M.heldRange.cloneRange() : M.selectionRange());
      M.heldRange = null;
      var draft = range && !M.rangeInOneMention(range) ? S.DM().taskFromSelection(range.toString()) : null;
      if (!draft || !M.state.current) return;
      var kept = range.cloneRange();
      M.lastRange = kept;
      M.hideSelBar();
      M.closePop();
      var lists = M.state.taskLists && M.state.taskLists.length ? M.state.taskLists : (M.state.sources && M.state.sources.lists) || [];
      var id = listId || S.DM().defaultTaskListId(lists);
      M.setBusy('Création de la tâche…');
      S.DT().createTask(M.t, draft.name, id, draft.desc).then(function (card) {
        M.setBusy('');
        if (!M.state.sources) M.state.sources = { members: [], contacts: [], cards: [], lists: lists, failed: [] };
        M.state.sources.cards = (M.state.sources.cards || []).filter(function (c) { return c && c.id !== card.id; });
        M.state.sources.cards.push({ id: card.id, name: card.name, idList: card.idList, dueComplete: false });
        M.rebuildIndex();
        var projectId = M.projectHere();
        var placed = projectId && S.DT().linkTaskToProject
          ? S.DT().linkTaskToProject(M.t, card.id, projectId).then(function () {
            return S.DT().ensureProjectDocs ? S.DT().ensureProjectDocs(M.t, M.state.docs) : { docs: M.state.docs };
          }, function () { return { docs: M.state.docs }; })
          : Promise.resolve(null);
        placed.then(function (r) {
          if (!r || !r.docs) return;
          M.state.docs = r.docs;
          M.state.idx = S.DT().getFolderIndex();
          M.state.docs.forEach(function (d) {
            if (d.subject && d.subject.k === 'project' && d.subject.id === projectId) M.setFolderOpen('doc:' + d.id, true);
          });
          M.paintList();
          if (M.state.current) M.paintProps();
        });
        if (!M.insertMentionAtRange(kept, { type: 'task', id: card.id, label: card.name })) {
          M.toast('Tâche créée, mais le lien n’a pas pu remplacer la sélection.', 'error');
          return;
        }
        var listName = '';
        lists.forEach(function (l) { if (l && String(l.id) === String(card.idList)) listName = l.name || ''; });
        M.toast(listName ? 'Tâche créée dans « ' + listName + ' ».' : 'Tâche créée.', 'ok');
      }, function (err) {
        M.setBusy('');
        M.failure(err);
      });
    };
    M.canCreateEntity = function canCreateEntity() {
      var EM = global.EntitiesModel;
      var ET = global.EntitiesTrello;
      var DE = global.DocsEntities;
      return !!(EM && ET && DE && typeof EM.createEntity === 'function' && typeof ET.load === 'function' && typeof ET.commit === 'function' && typeof DE.nameFromSelection === 'function');
    };
    M.createEntityFromSelection = function createEntityFromSelection() {
      var DE = global.DocsEntities;
      var EM = global.EntitiesModel;
      var ET = global.EntitiesTrello;
      var range = M.liveSelectionRange() || (M.heldRange && M.editor && M.editor.contains(M.heldRange.startContainer) ? M.heldRange.cloneRange() : M.selectionRange());
      M.heldRange = null;
      var name = range && !M.rangeInOneMention(range) && DE ? DE.nameFromSelection(range.toString()) : '';
      if (!name || !M.state.current || !M.canCreateEntity()) return;
      var kept = range.cloneRange();
      M.lastRange = kept;
      M.hideSelBar();
      M.closePop();
      var known = M.state.entityPack;
      var knownId = known ? DE.matchId(DE.catalogOf(known.schema, known.entities), name) : '';
      M.setBusy(knownId ? '' : 'Création de l’entité…');
      var ready = knownId
        ? Promise.resolve({ id: knownId, created: false, pack: known })
        : ET.load(M.t).then(function (pack) {
            if (!pack) pack = { schema: EM.defaultSchema(), entities: [], cards: {} };
            if (!pack.cards) pack.cards = {};
            var schema = pack.schema || EM.defaultSchema();
            var again = DE.matchId(DE.catalogOf(schema, pack.entities), name);
            if (again) return { id: again, created: false, pack: pack };
            var entity = EM.createEntity(schema, { name: name });
            return ET.commit(M.t, pack, schema, (pack.entities || []).concat([entity])).then(function (next) {
              return { id: entity.id, created: true, pack: next };
            });
          });
      ready.then(function (res) {
        M.setBusy('');
        if (res.pack) {
          M.state.entityPack = res.pack;
          M.rebuildIndex();
        }
        if (!M.insertMentionAtRange(kept, { type: 'entity', id: res.id, label: name })) {
          M.toast(res.created ? 'Entité créée, mais le lien n’a pas pu remplacer la sélection.' : 'Le lien n’a pas pu remplacer la sélection.', 'error');
          return;
        }
        M.watchEntities(M.editor);
        M.toast(res.created ? 'Entité créée.' : 'Lié à l’entité existante.', 'ok');
      }, function (err) {
        M.setBusy('');
        M.failure(err);
      });
    };
    M.onEditorContextMenu = function onEditorContextMenu(e) {
      var CM = global.ContextMenu;
      if (!CM || typeof CM.show !== 'function' || typeof CM.buildGenericItems !== 'function') return;
      if (!M.selectedDraft()) return;
      M.holdSelection();
      var items = CM.buildGenericItems(e.target, document) || [];
      items.unshift({ sep: true });
      if (M.canCreateEntity()) {
        items.unshift({
          id: 'create-entity',
          label: 'Créer une entité',
          icon: 'stack-2',
          action: function () { M.createEntityFromSelection(); },
        });
      }
      items.unshift({
        id: 'create-task',
        label: 'Créer une tâche',
        icon: 'plus',
        action: function () { M.createTaskFromSelection(); },
      });
      e.preventDefault();
      e.stopPropagation();
      M.hideSelBar();
      CM.show(e, items);
    };
    M.closePop = function closePop() {
      if (M.quick) {
        M.quick.destroy();
        M.quick = null;
      }
      if (M.pop && M.pop._ro) M.pop._ro.disconnect();
      if (M.pop && M.pop.parentNode) M.pop.parentNode.removeChild(M.pop);
      M.pop = null;
      M.previewChip = null;
      M.previewPinned = false;
    };
    M.placePop = function placePop(el, rect) {
      if (el.parentNode !== M.shell) M.shell.appendChild(el); // re-appending would drop the focus of a field inside
      var w = el.offsetWidth;
      var hh = el.offsetHeight;
      var left = Math.max(8, Math.min(rect.left, global.innerWidth - w - 8));
      var top = rect.bottom + 6;
      if (top + hh > global.innerHeight - 8) top = Math.max(8, rect.top - hh - 6);
      el.style.left = left + 'px';
      el.style.top = top + 'px';
    };
    M.anchorDocId = function anchorDocId(node) {
      if (!node || typeof node.getAttribute !== 'function') return '';
      var fromData = S.DM().cleanId(node.getAttribute('data-doc'));
      if (fromData) return fromData;
      return S.DM().docLinkId(node.getAttribute('href'));
    };
    M.rejectedAddress = function rejectedAddress(q) {
      var s = String(q || '').trim();
      if (!s || S.DM().safeHref(s)) return false;
      return /^[a-z][a-z0-9+.-]*:/i.test(s);
    };
    M.docNamed = function docNamed(title) {
      var folded = S.DM().fold(title);
      var list = (M.state.index && M.state.index.doc) || [];
      var i;
      for (i = 0; i < list.length; i++) {
        if (S.DM().fold(list[i].label) === folded) return true;
      }
      if (M.state.current) {
        var self = S.DM().resolveMention(M.state.index, 'doc', M.state.current.id);
        if (self && S.DM().fold(self.label) === folded) return true;
      }
      return false;
    };
    M.openLinkPopover = function openLinkPopover(existing) {
      M.saveSel();
      M.closeSuggest();
      M.closePop();
      var n = M.selNode();
      var anchor = existing || (n && M.closestIn(n, 'A'));
      var sel = global.getSelection();
      var rect = anchor ? anchor.getBoundingClientRect() : sel.rangeCount ? M.caretRect() : M.els.toolbar.getBoundingClientRect();
      var seed = '';
      if (anchor) {
        var existingId = M.anchorDocId(anchor);
        if (existingId) {
          var known = S.DM().resolveMention(M.state.index, 'doc', existingId);
          seed = (known && known.label) || '';
        } else seed = anchor.getAttribute('href') || '';
      } else {
        var raw = '';
        if (sel && !sel.isCollapsed && M.editor && M.editor.contains(sel.anchorNode)) raw = sel.toString();
        else if (M.lastRange && !M.lastRange.collapsed) raw = M.lastRange.toString();
        raw = String(raw).replace(/\s+/g, ' ').trim();
        if (raw.length <= 80) seed = raw;
      }
      var input = S.h('input', {
        class: 'dc-input',
        type: 'text',
        placeholder: 'Document…',
        value: seed,
        'aria-label': 'Document',
        spellcheck: 'false',
      });
      var err = S.h('div', { class: 'dc-pop-err', hidden: true });
      var list = S.h('div', { class: 'dc-link-list', role: 'listbox' });
      var choices = [];
      var active = 0;
      var activeKey = M.anchorDocId(anchor);
      activeKey = activeKey ? 'doc:' + activeKey : '';

      function choiceKey(ch) {
        if (!ch) return '';
        if (ch.kind === 'doc') return 'doc:' + ch.item.id;
        if (ch.kind === 'url') return 'url:' + ch.href;
        return 'create:' + ch.title;
      }
      function choicesFor(raw) {
        var trimmed = String(raw || '').trim();
        if (M.rejectedAddress(trimmed)) return [];
        var href = S.DM().safeHref(trimmed);
        if (href) return [{ kind: 'url', href: href }];
        var out = [];
        function pushDocs(query) {
          S.DM().searchMentions(M.state.index, 'doc', query).forEach(function (g) {
            g.items.forEach(function (item) { out.push({ kind: 'doc', item: item }); });
          });
        }
        pushDocs(trimmed);
        var title = S.DM().cleanTitle(trimmed);
        var create = title && !M.docNamed(title) ? { kind: 'create', title: title } : null;
        if (!out.length && trimmed) {
          if (create) out.push(create);
          pushDocs('');
          return out;
        }
        if (create) out.push(create);
        return out;
      }
      function indexFor(rows) {
        var i;
        if (activeKey) {
          for (i = 0; i < rows.length; i++) {
            if (choiceKey(rows[i]) === activeKey) return i;
          }
        }
        return 0;
      }
      function stampDoc(link, id) {
        link.setAttribute('href', 'doc:' + id);
        link.setAttribute('data-doc', id);
        link.classList.add('dc-doclink');
        link.removeAttribute('target');
        link.removeAttribute('rel');
      }
      function docAnchorHtml(id, label) {
        return '<a class="dc-doclink" href="doc:' + S.escHtml(id) + '" data-doc="' + S.escHtml(id) + '">' + S.escHtml(label) + '</a>';
      }
      function writeDocLink(linkNode, id) {
        if (linkNode && linkNode.parentNode && M.editor && M.editor.contains(linkNode)) {
          stampDoc(linkNode, id);
          M.onEdit();
          return;
        }
        M.restoreSel();
        var s = global.getSelection();
        if (!s || !s.rangeCount) return;
        if (s.isCollapsed) {
          var item = S.DM().resolveMention(M.state.index, 'doc', id);
          document.execCommand('insertHTML', false, M.withCompanion(docAnchorHtml(id, (item && item.label) || 'Document')));
        } else {
          document.execCommand('createLink', false, 'doc:' + id);
          var link = M.closestIn(M.selNode(), 'A');
          if (!link) {
            document.execCommand('insertHTML', false, M.withCompanion(docAnchorHtml(id, s.toString())));
            link = M.closestIn(M.selNode(), 'A');
          }
          if (link) stampDoc(link, id);
        }
        M.onEdit();
      }
      function applyDoc(id) {
        var range = M.lastRange;
        var linkNode = anchor;
        M.closePop();
        M.lastRange = range;
        writeDocLink(linkNode, id);
      }
      function applyHref(href) {
        var range = M.lastRange;
        M.closePop();
        M.lastRange = range;
        if (anchor && anchor.parentNode && M.editor && M.editor.contains(anchor)) {
          anchor.setAttribute('href', href);
          anchor.removeAttribute('data-doc');
          anchor.classList.remove('dc-doclink');
          anchor.setAttribute('target', '_blank');
          anchor.setAttribute('rel', 'noopener noreferrer');
          M.onEdit();
          return;
        }
        M.restoreSel();
        var s = global.getSelection();
        if (s && s.isCollapsed) {
          document.execCommand('insertHTML', false, M.withCompanion('<a href="' + S.escHtml(href) + '" target="_blank" rel="noopener noreferrer">' + S.escHtml(href) + '</a>'));
        } else {
          document.execCommand('createLink', false, href);
        }
        M.onEdit();
      }
      function applyCreate(title) {
        var range = M.lastRange;
        var linkNode = anchor;
        M.closePop();
        M.setBusy('Création du document…');
        S.DT().createDoc(M.t, title, '').then(
          function (doc) {
            M.setBusy('');
            M.state.docs.unshift({ id: doc.id, title: doc.title, updatedAt: doc.updatedAt });
            M.sortDocs();
            M.paintList();
            M.rebuildIndex();
            M.lastRange = range;
            writeDocLink(linkNode, doc.id);
            M.record({ type: 'create', targetId: doc.id, title: doc.title });
            M.toast('Document « ' + doc.title + ' » créé.', 'ok');
          },
          function (err) {
            M.setBusy('');
            M.failure(err);
          }
        );
      }
      function applyChoice(ch) {
        if (!ch) return;
        if (ch.kind === 'url') applyHref(ch.href);
        else if (ch.kind === 'doc') applyDoc(ch.item.id);
        else if (ch.kind === 'create') applyCreate(ch.title);
      }
      function removeLink() {
        var range = M.lastRange;
        M.closePop();
        M.lastRange = range;
        M.restoreSel();
        if (anchor && anchor.parentNode) {
          var r = document.createRange();
          r.selectNodeContents(anchor);
          var s = global.getSelection();
          s.removeAllRanges();
          s.addRange(r);
        }
        document.execCommand('unlink');
        M.onEdit();
      }
      function markActive() {
        Array.prototype.forEach.call(list.querySelectorAll('.dc-sg-row'), function (row) {
          var on = Number(row.getAttribute('data-i')) === active;
          row.classList.toggle('is-active', on);
          if (on && row.scrollIntoView) row.scrollIntoView({ block: 'nearest' });
        });
      }
      function paintChoices() {
        choices = choicesFor(input.value);
        active = indexFor(choices);
        if (choices[active]) activeKey = choiceKey(choices[active]);
        list.textContent = '';
        err.hidden = true;
        if (M.rejectedAddress(input.value)) {
          err.hidden = false;
          err.textContent = 'Adresse non valide (http, https ou mailto).';
        } else if (!choices.length) {
          list.appendChild(S.h('div', { class: 'dc-sg-none', text: 'Aucun document' }));
        }
        choices.forEach(function (ch, i) {
          var row;
          if (ch.kind === 'doc') {
            row = S.h('div', { class: 'dc-sg-row', title: ch.item.label }, [
              S.icon('file-text', 'dc-sg-icon dc-sg-icon--doc'),
              S.h('span', { class: 'dc-sg-label', text: ch.item.label }),
              ch.item.sub ? S.h('span', { class: 'dc-sg-sub', text: ch.item.sub }) : null,
            ]);
          } else if (ch.kind === 'create') {
            row = S.h('div', { class: 'dc-sg-row dc-sg-row--create', title: ch.title }, [
              S.icon('plus', 'dc-sg-icon dc-sg-icon--doc'),
              S.h('span', { class: 'dc-sg-label', text: 'Créer le document « ' + ch.title + ' »' }),
            ]);
          } else {
            row = S.h('div', { class: 'dc-sg-row', title: ch.href }, [
              S.icon('link', 'dc-sg-icon'),
              S.h('span', { class: 'dc-sg-label', text: ch.href }),
            ]);
          }
          row.setAttribute('role', 'option');
          row.setAttribute('data-i', String(i));
          if (i === active) row.classList.add('is-active');
          row.addEventListener('mousedown', function (e) { e.preventDefault(); });
          row.addEventListener('click', function () { applyChoice(ch); });
          row.addEventListener('mousemove', function () {
            if (active !== i) {
              active = i;
              activeKey = choiceKey(ch);
              markActive();
            }
          });
          list.appendChild(row);
        });
        if (M.pop && M.pop.parentNode) M.placePop(M.pop, rect);
      }
      input.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          if (!choices.length) return;
          e.preventDefault();
          active = (active + (e.key === 'ArrowDown' ? 1 : -1) + choices.length) % choices.length;
          activeKey = choiceKey(choices[active]);
          markActive();
          return;
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          var rows = choicesFor(input.value);
          if (!rows.length) {
            if (String(input.value || '').trim()) {
              err.hidden = false;
              err.textContent = 'Adresse non valide (http, https ou mailto).';
            }
            return;
          }
          applyChoice(rows[indexFor(rows)]);
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          var range = M.lastRange;
          M.closePop();
          M.lastRange = range;
          M.restoreSel();
        }
      });
      input.addEventListener('input', paintChoices);
      var tools = [];
      if (anchor && !M.anchorDocId(anchor)) {
        tools.push(S.h('button', {
          class: 'dc-tb',
          type: 'button',
          title: 'Ouvrir le lien',
          'aria-label': 'Ouvrir le lien',
          onclick: function () { global.open(anchor.getAttribute('href'), '_blank', 'noopener'); },
        }, [S.icon('external-link')]));
      }
      if (anchor) {
        tools.push(S.h('button', {
          class: 'dc-tb',
          type: 'button',
          title: 'Retirer le lien',
          'aria-label': 'Retirer le lien',
          onmousedown: function (e) { e.preventDefault(); },
          onclick: removeLink,
        }, [S.icon('unlink')]));
      }
      var field = S.h('div', { class: 'dc-pop-row' }, [input].concat(tools));
      M.pop = S.h('div', { class: 'dc-pop dc-pop--link' }, [field, list, err]);
      paintChoices();
      M.placePop(M.pop, rect);
      input.focus();
      input.select();
    };
    M.openPersonPopover = function openPersonPopover(chip) {
      M.closePop();
      var id = chip.getAttribute('data-id');
      var item = S.DM().resolveMention(M.state.index, 'person', id);
      var label = (item && item.label) || chip.getAttribute('data-label') || 'Personne';
      var rows = [S.h('div', { class: 'dc-pop-name', text: label })];
      if (item && item.sub) rows.push(S.h('div', { class: 'dc-pop-sub', text: item.sub }));
      if (item && item.email) rows.push(S.h('a', { class: 'dc-pop-line', href: 'mailto:' + item.email }, [S.icon('mail'), item.email]));
      if (item && item.phone) rows.push(S.h('div', { class: 'dc-pop-line' }, [S.icon('phone'), item.phone]));
      if (item && item.username) {
        rows.push(
          S.h('a', { class: 'dc-pop-line', href: 'https://trello.com/' + encodeURIComponent(item.username), target: '_blank', rel: 'noopener noreferrer' }, [S.icon('brand-trello'), 'Profil Trello'])
        );
      }
      if (!item) rows.push(S.h('div', { class: 'dc-pop-sub', text: 'Contact privé d’un autre membre ou personne retirée du tableau.' }));
      M.pop = S.h('div', { class: 'dc-pop dc-pop--person' }, rows);
      M.placePop(M.pop, chip.getBoundingClientRect());
    };
    M.openDocMenu = function openDocMenu(anchor, docId) {
      M.closePop();
      var task = M.taskById(docId);
      if (task) {
        var taskItem = function (iconName, label, run, danger) {
          return S.h('button', {
            class: 'dc-menu-item' + (danger ? ' is-danger' : ''),
            type: 'button',
            onclick: function () { M.closePop(); run(); },
          }, [S.icon(iconName), S.h('span', { text: label })]);
        };
        M.pop = S.h('div', { class: 'dc-pop dc-menu', role: 'menu' }, [
          taskItem('download', 'Télécharger (.md)', function () { M.exportDoc(docId, 'download'); }),
          taskItem('clipboard', 'Copier en Markdown', function () { M.exportDoc(docId, 'copy'); }),
          S.h('div', { class: 'dc-menu-sep' }),
          taskItem('archive', 'Archiver', function () { M.archiveTaskDoc(docId); }, true),
        ]);
        M.placePop(M.pop, anchor.getBoundingClientRect());
        return;
      }
      var d = M.state.docs.filter(function (x) { return x.id === docId; })[0] || (M.state.current && M.state.current.id === docId ? M.state.current : null);
      if (!d) return;
      var asFolder = S.DM().folderByDoc(M.state.idx, docId);
      function item(iconName, label, run, danger) {
        return S.h('button', {
          class: 'dc-menu-item' + (danger ? ' is-danger' : ''),
          type: 'button',
          onclick: function () {
            M.closePop();
            run();
          },
        }, [S.icon(iconName), S.h('span', { text: label })]);
      }
      M.pop = S.h('div', { class: 'dc-pop dc-menu', role: 'menu' }, [
        item('plus', 'Nouveau sous-document', function () { M.newDoc(null, null, null, docId); }),
        item('copy', 'Dupliquer', function () { M.duplicateDoc(docId); }),
        M.state.current && M.state.current.id === docId
          ? item('photo', M.state.current.cover ? 'Changer la couverture' : 'Ajouter une couverture', function () {
            if (!M.state.current.cover) M.addCover();
            else M.openCoverPicker(anchor.getBoundingClientRect());
          })
          : null,
        M.state.current && M.state.current.id === docId && S.DH()
          ? item('history', 'Historique des versions', M.openVersions)
          : null,
        item('download', 'Télécharger (.md)', function () { M.exportDoc(docId, 'download'); }),
        item('clipboard', 'Copier en Markdown', function () { M.exportDoc(docId, 'copy'); }),
        !asFolder && M.state.idx.parents && M.state.idx.parents[docId] && M.state.docs.some(function (x) { return x.id === M.state.idx.parents[docId]; })
          ? item('arrow-bar-up', 'Sortir du document parent', function () { M.unnestDoc(docId); })
          : null,
        asFolder ? null : item('folder-share', 'Déplacer vers un dossier…', function () {
          M.openFolderPicker(anchor, 'Déplacer le document vers', M.state.idx.docs[docId] || '', '', function (to) { M.moveDocToFolder(docId, to); });
        }),
        M.state.driveUrl
          ? item('brand-google-drive', 'Afficher dans Google Drive', function () {
            window.open(M.state.driveUrl, '_blank', 'noopener');
          })
          : null,
        S.h('div', { class: 'dc-menu-sep' }),
        asFolder
          ? (asFolder.archived
            ? item('archive-off', 'Restaurer', function () { M.editFolders(function (idx) { S.DM().restoreFolderIn(idx, asFolder.id); }, 'Dossier restauré.'); })
            : item('archive', 'Archiver…', function () { M.deleteFolder(asFolder.id); }, true))
          : (M.state.idx.archived && M.state.idx.archived[docId]
            ? item('archive-off', 'Restaurer', function () { M.restoreDoc(docId); })
            : item('archive', 'Archiver', function () { M.confirmDelete(docId); }, true)),
      ]);
      M.placePop(M.pop, anchor.getBoundingClientRect());
    };
    M.coverLabel = function coverLabel(c) {
      if (!c) return 'Aucune';
      if (c.k === 'color') {
        var col = S.DM().COVER_COLORS.filter(function (x) { return x.v === c.v; })[0];
        return 'Couleur' + (col ? ' ' + col.label.toLowerCase() : '');
      }
      if (c.k === 'gradient') {
        var g = S.DM().COVER_GRADIENTS.filter(function (x) { return x.id === c.v; })[0];
        return 'Dégradé' + (g ? ' ' + g.label.toLowerCase() : '');
      }
      if (c.k === 'unsplash') return 'Photo Unsplash' + (c.by ? ' (' + c.by + ')' : '');
      if (c.k === 'upload') return 'Image importée';
      return 'Image (lien)';
    };
    M.coverBtn = function coverBtn(iconName, label, run) {
      return S.h('button', { class: 'dc-cover-btn', type: 'button', onclick: function (e) { e.stopPropagation(); run(e.currentTarget); } }, [S.icon(iconName), S.h('span', { text: label })]);
    };
    M.paintCover = function paintCover() {
      var box = M.els.cover;
      var cur = M.state.current;
      var c = cur && cur.cover;
      M.repositioning = false;
      box.onpointerdown = null;
      box.textContent = '';
      box.className = 'dc-cover';
      box.style.background = '';
      box.hidden = !c;
      M.els.page.classList.toggle('has-cover', !!c);
      M.els.coverAdd.textContent = '';
      if (!cur || cur.kind === 'task') {
        box.hidden = true;
        M.els.page.classList.remove('has-cover');
        return;
      }
      if (!c) {
        M.els.coverAdd.appendChild(
          S.h('button', { class: 'dc-cover-ghost', type: 'button', onclick: M.addCover }, [S.icon('photo'), S.h('span', { text: 'Ajouter une couverture' })])
        );
        return;
      }
      var bg = S.DM().coverBackground(c);
      var isImage = !bg;
      if (bg) box.style.background = bg;
      else {
        var img = S.h('img', { class: 'dc-cover-img', alt: '', draggable: 'false' });
        var st = S.DM().coverImageStyle(c);
        img.style.objectPosition = st.objectPosition;
        img.style.transformOrigin = st.transformOrigin;
        img.style.transform = st.transform;
        img.addEventListener('error', function () { box.classList.add('is-broken'); });
        var url = S.DM().coverImageUrl(c, (global.devicePixelRatio || 1) > 1.5 ? 2400 : 1600);
        if (url) img.src = url;
        else {
          box.classList.add('is-loading');
          S.DT().coverBlobUrl(M.t, c).then(
            function (u) {
              box.classList.remove('is-loading');
              if (M.state.current === cur && cur.cover === c) img.src = u;
            },
            function () {
              box.classList.remove('is-loading');
              box.classList.add('is-broken');
            }
          );
        }
        box.appendChild(img);
        box.appendChild(S.icon('photo-off', 'dc-cover-broken'));
        var credit = S.DM().unsplashCredit(c);
        if (credit) {
          box.appendChild(
            S.h('div', { class: 'dc-cover-credit' }, [
              'Photo : ',
              S.h('a', { href: credit.profile, target: '_blank', rel: 'noopener noreferrer', text: credit.name }),
              ' / ',
              S.h('a', { href: credit.site, target: '_blank', rel: 'noopener noreferrer', text: 'Unsplash' }),
            ])
          );
        }
      }
      box.appendChild(
        S.h('div', { class: 'dc-cover-actions' }, [
          M.coverBtn('photo', 'Changer', function (btn) { M.openCoverPicker(btn.getBoundingClientRect()); }),
          isImage ? M.coverBtn('arrows-move', 'Repositionner', M.startReposition) : null,
          M.coverBtn('trash', 'Retirer', function () { M.setCover(null); }),
        ])
      );
    };
    M.setCover = function setCover(next) {
      var cur = M.state.current;
      if (!cur) return;
      cur.cover = S.DM().normalizeCover(next);
      M.paintCover();
      if (M.pop && M.pop.classList.contains('dc-cover-pop') && M.pop._paint) M.pop._paint();
      clearTimeout(M.coverTimer);
      M.coverCur = cur;
      M.coverTimer = setTimeout(function () { M.persistCover(cur); }, 450);
    };
    M.flushCover = function flushCover() {
      if (!M.coverTimer) return;
      clearTimeout(M.coverTimer);
      M.persistCover(M.coverCur);
    };
    M.persistCover = function persistCover(cur) {
      M.coverTimer = null;
      if (!cur) return;
      if (M.saving) {
        M.coverTimer = setTimeout(function () { M.persistCover(cur); }, 200);
        return;
      }
      var pre = M.state.current === cur ? M.saveNow() : Promise.resolve(true);
      pre.then(function (ok) {
        if (!ok) return; // conflict / error banner already shown; "Écraser" saves the cover with the text
        if (M.saving) {
          M.coverTimer = setTimeout(function () { M.persistCover(cur); }, 200);
          return;
        }
        var want = cur.cover || null;
        var before = cur.savedCover || null;
        if (S.DM().sameCover(before, want)) return;
        M.saving = true;
        if (M.state.current === cur) M.setSave('saving');
        S.DT().setCover(M.t, cur, want).then(
          function (res) {
            M.saving = false;
            cur.rev = res.rev;
            cur.updatedAt = res.updatedAt;
            cur.savedCover = res.cover;
            M.touchListItem(cur.id, { updatedAt: res.updatedAt });
            M.record({
              type: 'edit', key: 'cover', label: 'Couverture', targetId: cur.id,
              title: S.DM().cleanTitle(cur.title) || S.DM().UNTITLED,
              before: M.coverLabel(before), after: M.coverLabel(res.cover),
              beforeVal: S.DM().packCover(before), afterVal: S.DM().packCover(res.cover),
            });
            if (M.state.current !== cur) return;
            var dirty = M.editor && (S.DM().domToMd(M.editor) !== M.lastMd || (S.DM().cleanTitle(M.els.title.value) || S.DM().UNTITLED) !== M.savedTitle);
            M.setSave(dirty ? 'dirty' : 'saved');
            if (dirty) M.scheduleSave(300);
            M.paintMeta();
          },
          function (err) {
            M.saving = false;
            if (M.state.current !== cur) return M.failure(err);
            if (err && err.reason === 'conflict') {
              M.state.conflict = err.remote;
              M.setSave('conflict', 'Modifié ailleurs');
              M.paintConflict();
            } else {
              if (S.isAuthReason(err)) {
                M.state.authOk = false;
                M.paintBanner();
              }
              M.setSave('error', S.reasonText(err));
            }
          }
        );
      });
    };
    M.addCover = function addCover() {
      M.setCover(S.DM().randomCover());
      var btn = M.els.cover.querySelector('.dc-cover-actions .dc-cover-btn');
      M.openCoverPicker((btn || M.els.cover).getBoundingClientRect());
    };
    M.startReposition = function startReposition() {
      var cur = M.state.current;
      var c = cur && cur.cover;
      var box = M.els.cover;
      var img = box.querySelector('.dc-cover-img');
      if (!c || !img) return;
      M.closePop();
      M.repositioning = true;
      var ZMIN = S.DM().COVER_ZOOM_MIN;
      var ZMAX = S.DM().COVER_ZOOM_MAX;
      var pos = { px: c.px == null ? 50 : c.px, y: c.y == null ? 50 : c.y, z: c.z || ZMIN };
      box.classList.add('is-repositioning');
      var actions = box.querySelector('.dc-cover-actions');
      actions.textContent = '';
      function clamp(v, lo, hi) {
        return Math.max(lo, Math.min(hi, v));
      }
      /** Rendered photo size at the current zoom (object-fit: cover, then scaled). */
      function geo() {
        var bw = box.clientWidth;
        var bh = box.clientHeight;
        var s = img.naturalWidth ? Math.max(bw / img.naturalWidth, bh / img.naturalHeight) : 0;
        var k = pos.z / 100;
        return { bw: bw, bh: bh, w: s ? img.naturalWidth * s * k : bw * k, h: s ? img.naturalHeight * s * k : bh * k };
      }
      function paint() {
        var at = pos.px + '% ' + pos.y + '%';
        img.style.objectPosition = at;
        img.style.transformOrigin = at;
        img.style.transform = pos.z > ZMIN ? 'scale(' + pos.z / 100 + ')' : '';
        range.value = String(Math.round(pos.z));
      }
      /** Zooms keeping the photo point under (cx, cy) in place; the photo never gets smaller than the banner. */
      function zoomTo(z, cx, cy) {
        var g = geo();
        if (cx == null) { cx = g.bw / 2; cy = g.bh / 2; }
        var fx = (cx - (pos.px / 100) * (g.bw - g.w)) / g.w;
        var fy = (cy - (pos.y / 100) * (g.bh - g.h)) / g.h;
        pos.z = clamp(z, ZMIN, ZMAX);
        var n = geo();
        if (n.w - n.bw > 0.5) pos.px = clamp(((cx - fx * n.w) / (n.bw - n.w)) * 100, 0, 100);
        if (n.h - n.bh > 0.5) pos.y = clamp(((cy - fy * n.h) / (n.bh - n.h)) * 100, 0, 100);
        paint();
      }
      function onWheel(e) {
        e.preventDefault();
        var r = box.getBoundingClientRect();
        zoomTo(pos.z * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.002)), e.clientX - r.left, e.clientY - r.top);
      }
      function end(save) {
        document.removeEventListener('keydown', onKey, true);
        box.removeEventListener('wheel', onWheel);
        M.repositioning = false;
        var next = S.DM().normalizeCover(Object.assign({}, c, { px: Math.round(pos.px), y: Math.round(pos.y), z: Math.round(pos.z) }));
        if (save && M.state.current === cur && !S.DM().sameCover(next, c)) M.setCover(next);
        else M.paintCover();
      }
      function onKey(e) {
        if (e.key === 'Escape') { e.stopPropagation(); end(false); }
        else if (e.key === 'Enter') { e.preventDefault(); end(true); }
        else if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomTo(pos.z + 20); }
        else if (e.key === '-') { e.preventDefault(); zoomTo(pos.z - 20); }
      }
      var range = S.h('input', {
        type: 'range', min: String(ZMIN), max: String(ZMAX), step: '1', 'aria-label': 'Zoom',
        oninput: function (e) { zoomTo(Number(e.target.value)); },
      });
      document.addEventListener('keydown', onKey, true);
      box.addEventListener('wheel', onWheel, { passive: false });
      actions.appendChild(
        S.h('div', { class: 'dc-cover-zoom' }, [
          S.h('button', { class: 'dc-cover-zoom-btn', type: 'button', title: 'Zoom arrière', 'aria-label': 'Zoom arrière', onclick: function () { zoomTo(pos.z - 20); } }, [S.icon('zoom-out')]),
          range,
          S.h('button', { class: 'dc-cover-zoom-btn', type: 'button', title: 'Zoom avant', 'aria-label': 'Zoom avant', onclick: function () { zoomTo(pos.z + 20); } }, [S.icon('zoom-in')]),
        ])
      );
      actions.appendChild(M.coverBtn('check', 'Enregistrer', function () { end(true); }));
      actions.appendChild(M.coverBtn('x', 'Annuler', function () { end(false); }));
      paint();
      box.onpointerdown = function (e) {
        if (!M.repositioning || e.button !== 0 || (e.target.closest && e.target.closest('.dc-cover-actions'))) return;
        e.preventDefault();
        var sx = e.clientX;
        var sy = e.clientY;
        var start = { px: pos.px, y: pos.y };
        var g = geo();
        var ox = g.w - g.bw;
        var oy = g.h - g.bh;
        if (ox <= 1 && oy <= 1) return;
        try {
          box.setPointerCapture(e.pointerId);
        } catch (err) {
          /* pointer already gone: the drag just ends at the cover edge */
        }
        box.onpointermove = function (ev) {
          if (ox > 1) pos.px = clamp(start.px - ((ev.clientX - sx) / ox) * 100, 0, 100);
          if (oy > 1) pos.y = clamp(start.y - ((ev.clientY - sy) / oy) * 100, 0, 100);
          paint();
        };
        box.onpointerup = box.onpointercancel = function () {
          box.onpointermove = box.onpointerup = box.onpointercancel = null;
        };
      };
    };
    M.prepareCoverImage = function prepareCoverImage(file) {
      return new Promise(function (resolve, reject) {
        var type = String((file && file.type) || '');
        var ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }[type];
        if (!ext) return reject(new Error('Format non pris en charge (JPG, PNG, WebP ou GIF).'));
        if (ext === 'gif') {
          return file.size <= 10 * 1024 * 1024 ? resolve({ blob: file, ext: ext }) : reject(new Error('Image trop lourde (10 Mo au maximum).'));
        }
        var url = URL.createObjectURL(file);
        var im = new Image();
        im.onload = function () {
          URL.revokeObjectURL(url);
          var max = 2400;
          if (im.naturalWidth <= max && file.size <= 2 * 1024 * 1024) return resolve({ blob: file, ext: ext });
          var scale = Math.min(1, max / im.naturalWidth);
          var cv = document.createElement('canvas');
          cv.width = Math.round(im.naturalWidth * scale);
          cv.height = Math.round(im.naturalHeight * scale);
          cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);
          cv.toBlob(function (b) {
            if (!b) return reject(new Error('Image illisible.'));
            resolve({ blob: b, ext: b.type === 'image/webp' ? 'webp' : 'jpg' });
          }, 'image/webp', 0.85);
        };
        im.onerror = function () {
          URL.revokeObjectURL(url);
          reject(new Error('Image illisible.'));
        };
        im.src = url;
      });
    };
    },
    run: function (M) {
    M.COVER_TAB_KEY = 'cerveau.docs.coverTab';
    M.COVER_TABS = [['color', 'Couleur'], ['gradient', 'Dégradé'], ['unsplash', 'Unsplash'], ['upload', 'Importer']];
    M.coverTimer = null;
    M.coverCur = null;
    M.repositioning = false;
    M.unsplashRemote = true;
    }
  });
})(typeof window !== 'undefined' ? window : this);
