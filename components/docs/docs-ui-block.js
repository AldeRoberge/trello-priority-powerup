/**
 * docs-ui: mount() part 3 of 6.
 * The body of mount runs in order across these parts; its locals live on the per-call state object (M).
 * Order and shared names: see docs-ui.parts.json and docs/architecture.md.
 */
(function (global) {
  'use strict';

  var S = (global.DocsUiParts = global.DocsUiParts || {});
  var P = (global.DocsUiPartsMountMount = global.DocsUiPartsMountMount || { list: [] });

  P.list.push({
    define: function (M) {
    M.placeCaretAfter = function placeCaretAfter(mark) {
      var sel = global.getSelection();
      if (!sel || !mark || !mark.parentNode) return;
      var after = mark.nextSibling;
      if (!after || after.nodeType !== 3) {
        after = document.createTextNode('\u200b');
        mark.parentNode.insertBefore(after, mark.nextSibling);
      }
      var r = document.createRange();
      r.setStart(after, after.nodeValue.length);
      r.collapse(true);
      sel.removeAllRanges();
      sel.addRange(r);
    };
    M.applyInlineLive = function applyInlineLive() {
      var live = S.DL();
      if (!live) return false;
      var node = M.liveTextNode();
      if (!node || M.closestIn(node, 'A,.dc-mention,STRONG,B,EM,I,S,STRIKE,DEL,U,MARK')) return false;
      var hit = live.closingMark(node.nodeValue, global.getSelection().anchorOffset);
      if (!hit) return false;
      var sel = global.getSelection();
      var range = document.createRange();
      range.setStart(node, hit.start);
      range.setEnd(node, hit.end);
      sel.removeAllRanges();
      sel.addRange(range);
      document.execCommand('insertHTML', false, '<' + hit.tag + '>' + S.escHtml(hit.text) + '</' + hit.tag + '>\u200b');
      var cur = global.getSelection();
      var inside = cur && cur.anchorNode && M.closestIn(cur.anchorNode, hit.tag);
      if (inside && M.editor.contains(inside)) M.placeCaretAfter(inside);
      return true;
    };
    M.applyWikiClose = function applyWikiClose() {
      var live = S.DL();
      if (!live || !M.state.index) return false;
      var node = M.liveTextNode();
      if (!node) return false;
      var hit = live.wikiClose(node.nodeValue, global.getSelection().anchorOffset);
      if (!hit) return false;
      var want = S.DM().fold(hit.title);
      var docs = M.state.index.doc || [];
      var found = null;
      var i;
      for (i = 0; i < docs.length; i++) {
        if (S.DM().fold(docs[i].label) !== want) continue;
        if (found) return false;
        found = docs[i];
      }
      if (!found) return false;
      var sel = global.getSelection();
      var range = document.createRange();
      range.setStart(node, hit.start);
      range.setEnd(node, hit.end);
      sel.removeAllRanges();
      sel.addRange(range);
      M.insertMention({ type: 'doc', id: found.id, label: found.label });
      return true;
    };
    M.liveHotEl = function liveHotEl() {
      var live = S.DL();
      if (!live || !M.editor) return null;
      var sel = global.getSelection();
      if (!sel || !sel.rangeCount || !M.editor.contains(sel.anchorNode)) return null;
      var el = sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentNode;
      while (el && el !== M.editor) {
        if (el.nodeType === 1 && live.syntaxOf(el.tagName) && !M.closestIn(el, 'PRE')) {
          if (el.tagName === 'MARK' && el.hasAttribute('data-c')) {
            el = el.parentNode;
            continue;
          }
          return el;
        }
        el = el.parentNode;
      }
      return null;
    };
    M.paintLiveHot = function paintLiveHot() {
      if (!M.editor) return;
      var next = M.liveHotEl();
      var prev = M.editor.querySelectorAll('.dc-hot');
      var i;
      for (i = 0; i < prev.length; i++) {
        if (prev[i] === next) continue;
        prev[i].classList.remove('dc-hot');
        prev[i].removeAttribute('data-syn');
      }
      if (!next) return;
      var syn = S.DL().syntaxOf(next.tagName);
      if (!syn) return;
      next.setAttribute('data-syn', syn);
      next.classList.add('dc-hot');
    };
    M.atLiveEdge = function atLiveEdge(mark, which) {
      var sel = global.getSelection();
      if (!sel || !sel.isCollapsed || !sel.rangeCount) return false;
      if (sel.anchorNode !== mark && !mark.contains(sel.anchorNode)) return false;
      var r = document.createRange();
      try {
        r.selectNodeContents(mark);
        if (which === 'back') r.setEnd(sel.anchorNode, sel.anchorOffset);
        else r.setStart(sel.anchorNode, sel.anchorOffset);
      } catch (err) {
        return false;
      }
      return !r.toString().replace(/[\u200b\ufeff]/g, '');
    };
    M.unwrapLiveEdge = function unwrapLiveEdge(which) {
      var el = M.liveHotEl();
      if (!el || !el.classList.contains('dc-hot') || el.children.length) return false;
      if (!M.atLiveEdge(el, which)) return false;
      var text = el.textContent.replace(/[\u200b\ufeff]/g, '');
      var sel = global.getSelection();
      var range = document.createRange();
      range.selectNode(el);
      sel.removeAllRanges();
      sel.addRange(range);
      document.execCommand('insertText', false, text);
      if (el.isConnected && el.parentNode) {
        var tn = document.createTextNode(text);
        el.parentNode.replaceChild(tn, el);
        var r3 = document.createRange();
        r3.setStart(tn, which === 'back' ? 0 : tn.nodeValue.length);
        r3.collapse(true);
        sel.removeAllRanges();
        sel.addRange(r3);
        return true;
      }
      if (which === 'back' && text) {
        var s2 = global.getSelection();
        var n = s2 && s2.anchorNode;
        var off = s2 ? s2.anchorOffset : 0;
        if (n && n.nodeType === 3 && off >= text.length) {
          var r2 = document.createRange();
          r2.setStart(n, off - text.length);
          r2.collapse(true);
          s2.removeAllRanges();
          s2.addRange(r2);
        }
      }
      return true;
    };
    M.skipBlankText = function skipBlankText(node) {
      var prev = node;
      while (prev && prev.nodeType === 3 && !String(prev.nodeValue || '').replace(/[\u200b\ufeff]/g, '')) prev = prev.previousSibling;
      return prev;
    };
    M.personMentionToShorten = function personMentionToShorten() {
      var sel = global.getSelection();
      if (!sel || !sel.isCollapsed || !sel.rangeCount || !M.editor || !M.editor.contains(sel.anchorNode)) return null;
      var node = sel.anchorNode;
      var offset = sel.anchorOffset;
      var chip = null;
      if (node.nodeType === 3) {
        var head = String(node.nodeValue || '').slice(0, offset).replace(/[\u200b\ufeff]/g, '');
        if (head === '' || (head.length === 1 && /^[\u00a0 ]$/.test(head))) chip = M.skipBlankText(node.previousSibling);
      } else if (node.nodeType === 1 && offset > 0) {
        var prev = M.skipBlankText(node.childNodes[offset - 1]);
        if (prev && prev.nodeType === 3) {
          var gap = String(prev.nodeValue || '').replace(/[\u200b\ufeff]/g, '');
          if (gap.length === 1 && /^[\u00a0 ]$/.test(gap)) chip = M.skipBlankText(prev.previousSibling);
        } else chip = prev;
      }
      if (!chip || chip.nodeType !== 1 || !chip.classList || !chip.classList.contains('dc-mention')) return null;
      if (chip.getAttribute('data-m') !== 'person' || chip.getAttribute('data-short') === '1') return null;
      var full = String(chip.getAttribute('data-label') || '').replace(/\s+/g, ' ').trim();
      var first = S.DM().firstName(full);
      if (!first || first === full) return null;
      return chip;
    };
    M.shortenPersonChip = function shortenPersonChip(chip) {
      var first = S.DM().firstName(chip.getAttribute('data-label') || '');
      chip.setAttribute('data-short', '1');
      var last = chip.lastChild;
      if (last && last.nodeType === 3) last.nodeValue = first;
      else chip.appendChild(document.createTextNode(first));
    };
    M.listKindOf = function listKindOf(list) {
      if (!list) return '';
      if (list.classList && list.classList.contains('dc-todo')) return 'todo';
      return list.tagName === 'OL' ? 'ol' : 'ul';
    };
    M.createList = function createList(kind) {
      var el = document.createElement(kind === 'ol' ? 'ol' : 'ul');
      if (kind === 'todo') el.classList.add('dc-todo');
      return el;
    };
    M.listOfItem = function listOfItem(li) {
      var parent = li && li.parentNode;
      if (!parent || (parent.tagName !== 'UL' && parent.tagName !== 'OL')) return null;
      return parent;
    };
    M.prevListItem = function prevListItem(li) {
      var n = li.previousElementSibling;
      while (n && n.tagName !== 'LI') n = n.previousElementSibling;
      return n && n.tagName === 'LI' ? n : null;
    };
    M.ensureNested = function ensureNested(li, kind) {
      var last = li.lastElementChild;
      if (last && (last.tagName === 'UL' || last.tagName === 'OL') && M.listKindOf(last) === kind) return last;
      var nest = M.createList(kind);
      li.appendChild(nest);
      return nest;
    };
    M.keepCaret = function keepCaret(li, move) {
      var sel = global.getSelection();
      var mark = null;
      if (sel && sel.rangeCount && li.contains(sel.anchorNode)) {
        mark = { node: sel.anchorNode, offset: sel.anchorOffset };
      }
      var ok = move();
      if (ok && mark && mark.node && M.editor.contains(mark.node)) {
        try {
          var max = mark.node.nodeType === 3 ? mark.node.length : mark.node.childNodes.length;
          var range = document.createRange();
          range.setStart(mark.node, Math.min(mark.offset, max));
          range.collapse(true);
          sel.removeAllRanges();
          sel.addRange(range);
        } catch (err) { /* caret stays where the move left it */ }
      }
      return ok;
    };
    M.indentListItem = function indentListItem(li) {
      var parent = M.listOfItem(li);
      var prev = parent && M.prevListItem(li);
      if (!prev || prev === li) return false;
      return M.keepCaret(li, function () {
        M.ensureNested(prev, M.listKindOf(parent)).appendChild(li);
        return true;
      });
    };
    M.outdentListItem = function outdentListItem(li) {
      var parent = M.listOfItem(li);
      var owner = parent && parent.parentNode;
      if (!owner || owner.tagName !== 'LI') return false;
      var grand = M.listOfItem(owner);
      if (!grand) return false;
      return M.keepCaret(li, function () {
        var follow = [];
        var n = li.nextElementSibling;
        while (n) {
          var next = n.nextElementSibling;
          if (n.tagName === 'LI') follow.push(n);
          n = next;
        }
        grand.insertBefore(li, owner.nextSibling);
        if (follow.length) {
          var nest = M.ensureNested(li, M.listKindOf(parent));
          follow.forEach(function (item) { nest.appendChild(item); });
        }
        M.pruneEmpty(parent);
        return true;
      });
    };
    M.itemPlain = function itemPlain(li) {
      var text = '';
      var i;
      for (i = 0; i < li.childNodes.length; i++) {
        var k = li.childNodes[i];
        if (k.nodeType === 1 && (k.tagName === 'UL' || k.tagName === 'OL')) continue;
        text += k.textContent || '';
      }
      return text.replace(/[\u00a0\u200b\ufeff]/g, '').replace(/\s+/g, '');
    };
    M.itemHasNested = function itemHasNested(li) {
      var i;
      for (i = 0; i < li.children.length; i++) {
        var tag = li.children[i].tagName;
        if (tag === 'UL' || tag === 'OL') return true;
      }
      return false;
    };
    M.padItem = function padItem(li) {
      if (M.itemPlain(li)) return;
      var i;
      for (i = 0; i < li.childNodes.length; i++) {
        if (li.childNodes[i].nodeType === 1 && li.childNodes[i].tagName === 'BR') return;
      }
      li.insertBefore(document.createElement('br'), li.firstChild);
    };
    M.exitEmptyItem = function exitEmptyItem(li) {
      var parent = M.listOfItem(li);
      if (!parent) return false;
      var owner = parent.parentNode;
      if (owner && owner.tagName === 'LI' && M.listOfItem(owner)) {
        var grand = M.listOfItem(owner);
        grand.insertBefore(li, owner.nextSibling);
        if (M.listKindOf(grand) === 'todo') {
          if (!li.hasAttribute('data-checked')) li.setAttribute('data-checked', 'false');
        } else li.removeAttribute('data-checked');
        M.pruneEmpty(parent);
        M.focusInside(li);
        return true;
      }
      var p = document.createElement('p');
      p.appendChild(document.createElement('br'));
      var next = li.nextSibling;
      parent.removeChild(li);
      var rest = null;
      if (next) {
        rest = M.createList(M.listKindOf(parent));
        while (next) {
          var n2 = next.nextSibling;
          rest.appendChild(next);
          next = n2;
        }
      }
      var host = parent.parentNode;
      if (!parent.querySelector('li')) {
        host.insertBefore(p, parent);
        host.removeChild(parent);
      } else host.insertBefore(p, parent.nextSibling);
      if (rest && rest.childNodes.length) host.insertBefore(rest, p.nextSibling);
      M.focusInside(p);
      return true;
    };
    M.splitListItem = function splitListItem(li, range) {
      var parent = M.listOfItem(li);
      if (!parent) return false;
      var tail = document.createRange();
      try {
        tail.setStart(range.startContainer, range.startOffset);
        tail.setEnd(li, li.childNodes.length);
      } catch (err) {
        return false;
      }
      var frag = tail.extractContents();
      var fresh = document.createElement('li');
      if (M.listKindOf(parent) === 'todo') fresh.setAttribute('data-checked', 'false');
      var lists = [];
      var seenText = false;
      while (frag.firstChild) {
        var node = frag.firstChild;
        frag.removeChild(node);
        if (node.nodeType === 1 && (node.tagName === 'UL' || node.tagName === 'OL')) {
          lists.push(node);
          continue;
        }
        var blank = node.nodeType === 3
          ? !/\S/.test((node.nodeValue || '').replace(/[\u00a0\u200b\ufeff]/g, ''))
          : node.nodeType === 1 && node.tagName === 'BR';
        if (!seenText && blank) continue;
        fresh.appendChild(node);
        if (!blank) seenText = true;
      }
      if (!seenText) lists.forEach(function (list) { li.appendChild(list); });
      else lists.forEach(function (list) { fresh.appendChild(list); });
      if (!fresh.firstChild) fresh.appendChild(document.createElement('br'));
      M.padItem(li);
      parent.insertBefore(fresh, li.nextSibling);
      M.focusInside(fresh);
      return true;
    };
    M.enterListItem = function enterListItem(li) {
      var parent = M.listOfItem(li);
      if (!parent) return false;
      var sel = global.getSelection();
      if (!sel || !sel.rangeCount || !sel.isCollapsed) return false;
      if (sel.anchorNode !== li && !li.contains(sel.anchorNode)) return false;
      if (!M.itemPlain(li) && !M.itemHasNested(li)) return M.exitEmptyItem(li);
      return M.splitListItem(li, sel.getRangeAt(0));
    };
    M.onKeydown = function onKeydown(e) {
      var mod = e.ctrlKey || e.metaKey;
      if (M.sugg && M.handleSuggestKey(e)) return;
      if (e.key === 'Backspace' && !mod && !e.shiftKey && !e.altKey) {
        var person = M.personMentionToShorten();
        if (person) {
          e.preventDefault();
          M.shortenPersonChip(person);
          M.onEdit();
          return;
        }
        if (M.unwrapLiveEdge('back')) {
          e.preventDefault();
          M.onEdit('text');
          M.paintLiveHot();
          return;
        }
        if (M.docsRich() && M.docsRich().exitQuote()) {
          e.preventDefault();
          M.onEdit();
          M.paintToolbarState();
          return;
        }
      }
      if (e.key === 'Delete' && !mod && !e.shiftKey && !e.altKey && M.unwrapLiveEdge('del')) {
        e.preventDefault();
        M.onEdit('text');
        M.paintLiveHot();
        return;
      }
      if (mod && !e.shiftKey && !e.altKey) {
        var k = e.key.toLowerCase();
        if (k === 's') { e.preventDefault(); M.saveNow({ retry: true }); return; }
        if (k === 'k') { e.preventDefault(); M.openLinkPopover(); return; }
        if (k === 'e') { e.preventDefault(); M.runCommand('code'); return; }
      }
      if (mod && e.shiftKey && !e.altKey) {
        if (e.key === 'X' || e.key === 'x') { e.preventDefault(); M.runCommand('strike'); return; }
        if (e.key === 'H' || e.key === 'h') { e.preventDefault(); M.runCommand('highlight'); return; }
        if (e.key === '7' || e.key === '&') { e.preventDefault(); M.runCommand('ol'); return; }
        if (e.key === '8' || e.key === '*') { e.preventDefault(); M.runCommand('ul'); return; }
        if (e.key === '9' || e.key === '(') { e.preventDefault(); M.runCommand('todo'); return; }
      }
      if (mod && e.altKey && /^[0-3]$/.test(e.key)) {
        e.preventDefault();
        M.runCommand(e.key === '0' ? 'p' : 'h' + e.key);
        return;
      }
      if (e.key === 'Tab') {
        var n = M.selNode();
        var tabCell = n && M.closestIn(n, 'TD,TH');
        if (tabCell) {
          e.preventDefault();
          M.moveTableCell(tabCell, e.shiftKey ? -1 : 1);
          M.onEdit();
          return;
        }
        var li = n && M.closestIn(n, 'LI');
        if (li) {
          e.preventDefault();
          if (e.shiftKey ? M.outdentListItem(li) : M.indentListItem(li)) M.onEdit();
        } else if (n && M.closestIn(n, 'PRE')) {
          e.preventDefault();
          document.execCommand('insertText', false, '  ');
        }
        return;
      }
      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !e.shiftKey && !e.altKey && !mod) {
        var preEdge = M.closestIn(M.selNode(), 'PRE');
        if (preEdge && M.onCodeEdge(preEdge, e.key === 'ArrowDown' ? 'end' : 'start')) {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            M.focusEdge(M.placeAfter(preEdge), false);
          } else {
            var above = M.blockBefore(preEdge);
            if (above) {
              e.preventDefault();
              M.focusEdge(above, true);
            }
          }
          return;
        }
      }
      if (e.key === 'Enter' && !mod) {
        var enterCell = M.closestIn(M.selNode(), 'TD,TH');
        if (enterCell) {
          e.preventDefault();
          if (e.shiftKey) document.execCommand('insertHTML', false, '<br>');
          else M.focusCell(M.cellBelow(enterCell));
          M.onEdit();
          return;
        }
      }
      if (e.key === 'Enter' && !e.shiftKey && !mod) {
        if (M.docsRich() && M.docsRich().leaveEmptyQuote()) {
          e.preventDefault();
          M.onEdit();
          M.paintToolbarState();
          return;
        }
        var liEnter = M.closestIn(M.selNode(), 'LI');
        if (liEnter && !M.closestIn(M.selNode(), 'PRE')) {
          e.preventDefault();
          if (M.enterListItem(liEnter)) M.onEdit();
          return;
        }
        var before = M.textBeforeCaret();
        var nn = M.selNode();
        var block = nn && M.closestIn(nn, 'P,DIV');
        if (block && !M.closestIn(block, 'LI') && before !== null) {
          var t2 = block.textContent.replace(/[\u00a0\u200b]/g, ' ').trim();
          if (/^(---|\*\*\*|___)$/.test(t2)) {
            e.preventDefault();
            var rr = document.createRange();
            rr.selectNodeContents(block);
            var s2 = global.getSelection();
            s2.removeAllRanges();
            s2.addRange(rr);
            document.execCommand('delete');
            M.insertRule();
            M.onEdit();
            return;
          }
          if (/^```[\w-]*$/.test(t2)) {
            e.preventDefault();
            var r3 = document.createRange();
            r3.selectNodeContents(block);
            var s3 = global.getSelection();
            s3.removeAllRanges();
            s3.addRange(r3);
            document.execCommand('delete');
            M.runCommand('codeblock', { silent: true });
            M.onEdit();
            return;
          }
        }
      }
    };
    M.onPaste = function onPaste(e) {
      var cd = e.clipboardData;
      if (!cd) return;
      var pasted = M.imageFilesFrom(cd);
      if (pasted.length) {
        e.preventDefault();
        var at = M.selNode();
        M.insertImageFiles(pasted, at && M.rowOf(at), false);
        return;
      }
      var html = cd.getData('text/html');
      var text = cd.getData('text/plain');
      if (!html && !text) return;
      e.preventDefault();
      var out;
      if (html) {
        var parsed = new DOMParser().parseFromString(html, 'text/html');
        out = S.DM().mdToHtml(S.DM().domToMd(parsed.body));
      } else if (S.DL() && S.DL().looksLikeMarkdown(text)) {
        out = S.DM().mdToHtml(text);
      } else {
        out = text
          .replace(/\r\n?/g, '\n')
          .split(/\n{2,}/)
          .map(function (para) { return '<p>' + S.escHtml(para).replace(/\n/g, '<br>') + '</p>'; })
          .join('');
      }
      var single = /^<p>((?:(?!<\/?p>)[\s\S])*)<\/p>$/.exec(out);
      document.execCommand('insertHTML', false, M.plainChips(single ? M.withCompanion(single[1]) : out));
      M.fixChips();
      M.refreshChips();
      if (!html) M.applyWikiClose();
      M.onEdit();
    };
    M.refreshChips = function refreshChips() {
      if (!M.editor || !M.state.index) return;
      var failed = (M.state.sources && M.state.sources.failed) || [];
      Array.prototype.forEach.call(M.editor.querySelectorAll('.dc-mention'), function (chip) {
        var type = chip.getAttribute('data-m');
        var id = chip.getAttribute('data-id');
        var item = S.DM().resolveMention(M.state.index, type, id);
        var missing = false;
        if (item) {
          var short = type === 'person' && chip.getAttribute('data-short') === '1';
          var shown = short ? (S.DM().firstName(item.label) || item.label) : item.label;
          if (chip.getAttribute('data-label') !== item.label) chip.setAttribute('data-label', item.label);
          var last = chip.lastChild;
          if (last && last.nodeType === 3 && last.nodeValue !== shown) last.nodeValue = shown;
          chip.title = item.sub ? item.sub : '';
        } else if (type === 'task') missing = !!M.state.sources && failed.indexOf('cards') < 0;
        else if (type === 'doc') missing = M.state.docsLoaded;
        chip.classList.toggle('is-missing', !!missing);
        if (missing) chip.title = type === 'task' ? 'Tâche introuvable (archivée ou supprimée)' : 'Document introuvable';
        chip.classList.toggle('is-done', !!(item && item.done));
      });
    };
    M.watchEntities = function watchEntities(ed) {
      if (!global.DocsEntities || typeof global.DocsEntities.watch !== 'function') return;
      global.DocsEntities.watch(ed, {
        t: M.t,
        paused: function () { return !!M.sugg; },
        onChange: function () { M.onEdit('text'); },
        onCatalog: function (pack) {
          M.state.entityPack = pack;
          M.rebuildIndex();
        },
      });
    };
    M.rebuildIndex = function rebuildIndex() {
      var src = M.state.sources || { members: [], contacts: [], cards: [], lists: [], failed: [] };
      var pack = M.state.entityPack;
      M.state.index = S.DM().buildMentionIndex({
        members: src.members,
        contacts: src.contacts,
        cards: src.cards,
        lists: src.lists,
        docs: M.state.docs.map(function (d) {
          return { id: d.id, title: d.title, sub: S.DM().relativeTime(d.updatedAt) };
        }),
        excludeDocId: M.state.current ? M.state.current.id : '',
        entities: pack && pack.entities ? pack.entities : [],
      });
      M.refreshChips();
    };
    M.loadSources = function loadSources() {
      return S.DT()
        .loadMentionSources(M.t)
        .then(function (src) {
          M.state.sources = src;
          M.rebuildIndex();
          var STT = global.StatutTrello;
          var TM = global.TableModel;
          if (!STT || typeof STT.readStatutSettings !== 'function' || !TM || typeof TM.enrichLists !== 'function') {
            M.state.taskLists = src.lists || [];
            return;
          }
          return STT.readStatutSettings(M.t).then(function (settings) {
            M.state.taskLists = TM.enrichLists(src.lists || [], settings, global.StatutMatch);
          }, function () {
            M.state.taskLists = src.lists || [];
          });
        });
    };
    M.openMention = function openMention(chip) {
      var type = chip.getAttribute('data-m');
      var id = chip.getAttribute('data-id');
      if (type === 'doc') {
        if (M.state.docs.some(function (d) { return d.id === id; }) || (M.state.current && M.state.current.id === id)) M.openDoc(id);
        else M.toast('Ce document est introuvable.', 'error');
      } else if (type === 'task') {
        M.openTaskPreview(chip, true);
      } else {
        M.openPersonPopover(chip);
      }
    };
    M.openTaskPreview = function openTaskPreview(chip, pin) {
      clearTimeout(M.previewTimer);
      if (M.previewChip === chip && M.pop && M.pop.classList.contains('dc-pop--task')) {
        if (pin) M.previewPinned = true;
        return;
      }
      M.closePop();
      M.previewChip = chip;
      M.previewPinned = !!pin;
      var id = chip.getAttribute('data-id');
      var name = chip.getAttribute('data-label') || 'Carte';
      var el = S.h('div', { class: 'dc-pop dc-pop--task' });
      M.pop = el;
      el.addEventListener('mouseenter', function () { clearTimeout(M.previewTimer); });
      el.addEventListener('mouseleave', function () { if (!M.previewPinned) M.scheduleClosePreview(); });
      // Using the panel pins it: several quick actions in a row, until a click elsewhere.
      el.addEventListener('mousedown', function () { M.previewPinned = true; });
      var rect = chip.getBoundingClientRect();
      if (!global.CardQuick) {
        el.appendChild(S.h('div', { class: 'dc-pop-name', text: name }));
        el.appendChild(S.h('div', { class: 'dc-pop-row' }, [S.h('button', { class: 'dc-btn dc-btn--primary', type: 'button', onclick: function () { M.closePop(); M.openTask(id, name); } }, [S.icon('external-link'), 'Ouvrir'])]));
        M.placePop(el, rect);
        return;
      }
      M.placePop(el, rect);
      M.quick = global.CardQuick.mount(el, {
        t: M.t,
        cardId: id,
        name: name,
        mentions: global.WorkOS && typeof global.WorkOS.backlinks === 'function'
          ? global.WorkOS.backlinks(M.docsForLinks(), 'task', id).map(function (d) {
              return { title: d.title, open: function () { M.closePop(); M.openDoc(d.id); } };
            })
          : [],
        onOpen: function () { M.closePop(); M.openTask(id, name); },
        onChange: function () { M.loadSources(); },
        onHold: function (on) { if (on) M.previewPinned = true; },
        onToast: function (m, kind, action) { M.toast(m, kind === 'error' ? 'error' : '', action); },
        onGone: function () { if (M.pop === el) M.closePop(); },
      });
      // The panel grows once the card is loaded: keep it on screen until the user resizes or zooms it.
      if (global.ResizeObserver) {
        var ro = new global.ResizeObserver(function () {
          if (M.pop !== el) { ro.disconnect(); return; }
          if (el._userSized) return;
          M.placePop(el, rect);
        });
        ro.observe(el);
        el._ro = ro;
      }
      M.wireTaskPopSize(el);
    };
    M.wireTaskPopSize = function wireTaskPopSize(el) {
      var CQ = global.CardQuick;
      if (!CQ || typeof CQ.resizeRect !== 'function' || typeof CQ.zoomAt !== 'function') return;
      var minW = 260;
      var minH = 160;
      ['nw', 'ne', 'sw', 'se'].forEach(function (corner) {
        var handle = S.h('div', { class: 'dc-pop-corner dc-pop-corner--' + corner });
        handle.addEventListener('pointerdown', function (e) {
          if (e.button !== 0) return;
          e.preventDefault();
          e.stopPropagation();
          M.previewPinned = true;
          el._userSized = true;
          var scale = el._scale || 1;
          var startX = e.clientX;
          var startY = e.clientY;
          var start = el.getBoundingClientRect();
          try { handle.setPointerCapture(e.pointerId); } catch (err) { /* listeners still follow */ }
          function move(ev) {
            var box = CQ.resizeRect(start, corner, ev.clientX - startX, ev.clientY - startY, minW * scale, minH * scale);
            el.classList.add('is-sized');
            el.style.maxWidth = 'none';
            el.style.width = (box.width / scale) + 'px';
            el.style.height = (box.height / scale) + 'px';
            el.style.left = box.left + 'px';
            el.style.top = box.top + 'px';
          }
          function up() {
            handle.removeEventListener('pointermove', move);
            handle.removeEventListener('pointerup', up);
            handle.removeEventListener('pointercancel', up);
          }
          handle.addEventListener('pointermove', move);
          handle.addEventListener('pointerup', up);
          handle.addEventListener('pointercancel', up);
        });
        el.appendChild(handle);
      });
      el.addEventListener('wheel', function (e) {
        e.preventDefault();
        var prev = el._scale || 1;
        var dy = e.deltaY;
        if (e.deltaMode === 1) dy *= 16;
        else if (e.deltaMode === 2) dy *= 400;
        var next = Math.max(0.7, Math.min(2.5, prev * Math.exp(-dy * 0.0015)));
        if (Math.abs(next - prev) < 0.001) return;
        var vis = el.getBoundingClientRect();
        var at = CQ.zoomAt(vis, e.clientX, e.clientY, prev, next);
        el._scale = at.scale;
        el._userSized = true;
        el.style.transformOrigin = '0 0';
        el.style.transform = at.scale === 1 ? '' : 'scale(' + at.scale + ')';
        el.style.left = at.left + 'px';
        el.style.top = at.top + 'px';
      }, { passive: false });
    };
    M.scheduleClosePreview = function scheduleClosePreview() {
      clearTimeout(M.previewTimer);
      M.previewTimer = setTimeout(function () {
        if (!M.previewPinned && M.pop && M.pop.classList.contains('dc-pop--task')) M.closePop();
      }, 250);
    };
    M.openTask = function openTask(cardId, name) {
      if (!cardId || !global.TaskFocus) return;
      global.TaskFocus.open({
        t: M.t,
        cardId: cardId,
        name: name || '',
        onChange: function () { M.loadFace(); },
        onToast: function (m, kind, action) { M.toast(m, kind === 'error' ? 'error' : '', action); },
      });
    };
    M.setBlock = function setBlock(tag) {
      document.execCommand('formatBlock', false, '<' + tag + '>');
    };
    M.insertRule = function insertRule() {
      document.execCommand('insertHorizontalRule');
      // keep a paragraph after the rule so the caret has somewhere to go
      var hrs = M.editor.querySelectorAll('hr');
      var hr = hrs[hrs.length - 1];
      var sel = global.getSelection();
      if (sel.rangeCount) {
        var a = sel.anchorNode;
        var hrNear = M.closestIn(a, 'HR') || null;
        hr = hrNear || hr;
      }
      if (hr && !hr.nextElementSibling) {
        var p = document.createElement('p');
        p.appendChild(document.createElement('br'));
        hr.parentNode.insertBefore(p, hr.nextSibling);
        var r = document.createRange();
        r.setStart(p, 0);
        r.collapse(true);
        sel.removeAllRanges();
        sel.addRange(r);
      }
    };
    M.markTodoList = function markTodoList(ul) {
      ul.classList.add('dc-todo');
      Array.prototype.forEach.call(ul.children, function (li) {
        if (li.tagName === 'LI' && !li.hasAttribute('data-checked')) li.setAttribute('data-checked', 'false');
      });
    };
    M.unmarkTodoList = function unmarkTodoList(ul) {
      ul.classList.remove('dc-todo');
      Array.prototype.forEach.call(ul.children, function (li) {
        if (li.tagName === 'LI') li.removeAttribute('data-checked');
      });
    };
    M.toggleTodo = function toggleTodo() {
      var n = M.selNode();
      var li = n && M.closestIn(n, 'LI');
      var ul = li && li.parentNode;
      if (ul && ul.tagName === 'UL') {
        if (ul.classList.contains('dc-todo')) {
          M.unmarkTodoList(ul);
          document.execCommand('insertUnorderedList'); // the checklist button is a toggle: off = plain paragraphs
        } else M.markTodoList(ul);
        return;
      }
      if (ul && ul.tagName === 'OL') document.execCommand('insertOrderedList'); // OL -> plain paragraphs first
      document.execCommand('insertUnorderedList');
      var n2 = M.selNode();
      var li2 = n2 && M.closestIn(n2, 'LI');
      if (li2 && li2.parentNode.tagName === 'UL') M.markTodoList(li2.parentNode);
    };
    M.toggleList = function toggleList(kind) {
      var n = M.selNode();
      var li = n && M.closestIn(n, 'LI');
      var ul = li && li.parentNode;
      if (kind === 'ul' && ul && ul.tagName === 'UL' && ul.classList.contains('dc-todo')) {
        M.unmarkTodoList(ul); // checklist -> plain bullets
        return;
      }
      document.execCommand(kind === 'ul' ? 'insertUnorderedList' : 'insertOrderedList');
    };
    M.toggleInlineCode = function toggleInlineCode() {
      var sel = global.getSelection();
      if (!sel.rangeCount) return;
      var n = M.selNode();
      var code = n && M.closestIn(n, 'CODE');
      if (code) {
        var r = document.createRange();
        r.selectNodeContents(code);
        sel.removeAllRanges();
        sel.addRange(r);
        document.execCommand('insertText', false, code.textContent);
        return;
      }
      if (sel.isCollapsed) return;
      var text = sel.toString();
      document.execCommand('insertHTML', false, '<code>' + S.escHtml(text) + '</code>\u200b');
    };
    M.runCommand = function runCommand(cmd, opts) {
      if (!M.editor) return;
      opts = opts || {};
      M.restoreSel();
      if (M.docsRich() && M.docsRich().run(cmd)) {
        if (cmd !== 'highlight' && !opts.silent) {
          M.onEdit();
          M.paintToolbarState();
        }
        return;
      }
      switch (cmd) {
        case 'undo': document.execCommand('undo'); break;
        case 'redo': document.execCommand('redo'); break;
        case 'bold': document.execCommand('bold'); break;
        case 'italic': document.execCommand('italic'); break;
        case 'underline': document.execCommand('underline'); break;
        case 'strike': document.execCommand('strikeThrough'); break;
        case 'code': M.toggleInlineCode(); break;
        case 'p': case 'h1': case 'h2': case 'h3': {
          if (cmd !== 'p' && M.blockType() === cmd && !opts.force) M.setBlock('p');
          else M.setBlock(cmd);
          break;
        }
        case 'ul': case 'ol': M.toggleList(cmd); break;
        case 'todo': M.toggleTodo(); break;
        case 'quote': {
          var quoted = M.selNode();
          var host = quoted && M.closestIn(quoted, 'BLOCKQUOTE');
          if (host && M.docsRich()) {
            var turned = M.docsRich().unwrapQuote(host);
            if (turned) M.focusInside(turned);
          } else if (host) document.execCommand('formatBlock', false, '<p>');
          else document.execCommand('formatBlock', false, '<blockquote>');
          break;
        }
        case 'codeblock': {
          if (M.blockType() === 'codeblock') M.setBlock('p');
          else M.setBlock('pre');
          break;
        }
        case 'hr': M.insertRule(); break;
        case 'image': {
          var imgNode = M.selNode();
          var imgRow = imgNode && M.rowOf(imgNode);
          if (!imgRow) return;
          M.openImagePopover(imgRow, M.isEmptyBlock(imgRow) || M.isImageBlock(imgRow));
          return;
        }
        case 'indent': document.execCommand('indent'); break;
        case 'outdent': document.execCommand('outdent'); break;
        case 'link': M.openLinkPopover(); return;
        case 'table': M.insertTable(); break;
        case 'callout-note': M.setCallout('note'); break;
        case 'callout-tip': M.setCallout('tip'); break;
        case 'callout-warning': M.setCallout('warning'); break;
        case 'align-left': M.setAlign('left'); break;
        case 'align-center': M.setAlign('center'); break;
        case 'align-right': M.setAlign('right'); break;
        case 'mention-person': document.execCommand('insertText', false, '@'); break;
        case 'mention-task': document.execCommand('insertText', false, '@@'); break;
        case 'mention-doc': document.execCommand('insertText', false, '@@@'); break;
        default: return;
      }
      if (!opts.silent) {
        M.onEdit();
        M.paintToolbarState();
      }
    };
    M.isImageBlock = function isImageBlock(el) {
      return !!(el && el.classList && el.classList.contains('dc-image'));
    };
    M.isEmptyBlock = function isEmptyBlock(el) {
      if (!el || M.isImageBlock(el) || el.tagName === 'HR' || el.tagName === 'PRE' || el.tagName === 'TABLE') return false;
      return !/\S/.test(el.textContent || '');
    };
    M.rowOf = function rowOf(node) {
      if (!node || !M.editor || !M.editor.contains(node) || node === M.editor) return null;
      var el = node.nodeType === 1 ? node : node.parentNode;
      var li = null;
      while (el && el !== M.editor) {
        if (el.tagName === 'LI' && !li) li = el;
        el = el.parentNode;
      }
      if (li && M.editor.contains(li)) return li;
      el = node.nodeType === 1 ? node : node.parentNode;
      while (el && el.parentNode !== M.editor) el = el.parentNode;
      if (!el || el === M.editor) return null;
      if (el.tagName === 'UL' || el.tagName === 'OL') return el.querySelector('li');
      return el;
    };
    M.currentRow = function currentRow() {
      var n = M.selNode();
      return n ? M.rowOf(n) : null;
    };
    M.firstLineCenter = function firstLineCenter(block) {
      if (block.tagName === 'HR') {
        var hr = block.getBoundingClientRect();
        return hr.top + hr.height / 2;
      }
      if (M.isImageBlock(block)) {
        var img = block.querySelector('img') || block;
        var ir = img.getBoundingClientRect();
        if (ir.height) return ir.top + Math.min(ir.height, 24) / 2;
      }
      var range = document.createRange();
      var text = null;
      var blank = null;
      var walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, null);
      var n;
      while ((n = walker.nextNode())) {
        if (/\S/.test(n.data)) { text = n; break; }
        if (!blank && n.data) blank = n;
      }
      try {
        if (text) {
          range.setStart(text, 0);
          range.setEnd(text, 1);
        } else if (blank) {
          range.setStart(blank, 0);
          range.setEnd(blank, Math.min(1, blank.data.length));
        } else {
          var br = block.querySelector('br');
          if (br) {
            range.setStartBefore(br);
            range.setEndAfter(br);
          } else {
            range.selectNodeContents(block);
          }
        }
        var rects = range.getClientRects();
        var i;
        for (i = 0; i < rects.length; i++) {
          if (rects[i].height >= 1) return rects[i].top + rects[i].height / 2;
        }
      } catch (err) { /* empty or detached: use the line box */ }
      var box = block.getBoundingClientRect();
      var cs = global.getComputedStyle(block);
      var lead = (parseFloat(cs.borderTopWidth) || 0) + (parseFloat(cs.paddingTop) || 0);
      var lh = parseFloat(cs.lineHeight);
      if (!(lh > 0)) lh = (parseFloat(cs.fontSize) || 15) * 1.7;
      return box.top + lead + Math.min(box.height - lead, lh) / 2;
    };
    M.showBlockUi = function showBlockUi(block) {
      if (!block || !M.editor || !M.editor.contains(block) || !M.els.blockUi) return;
      M.blockHover = block;
      var pageRect = M.els.page.getBoundingClientRect();
      var center = M.firstLineCenter(block);
      var uiH = M.els.blockUi.offsetHeight || 22;
      M.els.blockUi.style.top = (center - pageRect.top - M.els.page.clientTop - uiH / 2) + 'px';
      M.els.blockUi.hidden = false;
    };
    M.hideBlockUi = function hideBlockUi() {
      M.blockHover = null;
      if (M.els.blockUi) M.els.blockUi.hidden = true;
    };
    M.scheduleHideBlock = function scheduleHideBlock() {
      clearTimeout(M.blockHideTimer);
      M.blockHideTimer = setTimeout(function () {
        if (M.dragBlock) return;
        if (M.pop && (M.pop.classList.contains('dc-block-menu') || M.pop.querySelector('input[type="file"]'))) return;
        M.hideBlockUi();
      }, 200);
    };
    M.placeDropLine = function placeDropLine(row, before) {
      var y = (before ? row.getBoundingClientRect().top : row.getBoundingClientRect().bottom) - M.els.page.getBoundingClientRect().top - M.els.page.clientTop;
      M.els.dropLine.style.top = Math.max(0, y) + 'px';
      M.els.dropLine.hidden = false;
    };
    M.focusInside = function focusInside(el) {
      if (!el || !M.editor) return;
      M.editor.focus();
      var sel = global.getSelection();
      var r = document.createRange();
      if (!el.firstChild || el.tagName === 'HR' || M.isImageBlock(el)) {
        r.setStartBefore(el);
        r.collapse(true);
      } else {
        r.selectNodeContents(el);
        r.collapse(true);
      }
      sel.removeAllRanges();
      sel.addRange(r);
      M.saveSel();
    };
    M.ensureTail = function ensureTail() {
      if (!M.editor) return;
      var last = M.editor.lastElementChild;
      if (last && (last.tagName === 'HR' || last.tagName === 'PRE' || M.isImageBlock(last))) {
        var p = document.createElement('p');
        p.appendChild(document.createElement('br'));
        M.editor.appendChild(p);
      }
    };
    M.preSideText = function preSideText(pre, edge) {
      var sel = global.getSelection();
      if (!sel || !sel.isCollapsed || !sel.rangeCount || !pre.contains(sel.anchorNode)) return null;
      var range = sel.getRangeAt(0);
      var slice = document.createRange();
      try {
        slice.selectNodeContents(pre);
        if (edge === 'end') slice.setStart(range.endContainer, range.endOffset);
        else slice.setEnd(range.startContainer, range.startOffset);
      } catch (err) {
        return null;
      }
      return slice.toString().replace(/[\u200b\ufeff]/g, '');
    };
    M.onCodeEdge = function onCodeEdge(pre, edge) {
      var text = M.preSideText(pre, edge);
      if (text === null) return false;
      if (edge === 'end') return text.replace(/\n$/, '').indexOf('\n') < 0;
      return text.replace(/^\n/, '').indexOf('\n') < 0;
    };
    M.nextEditable = function nextEditable(el) {
      while (el && (el.tagName === 'HR' || M.isImageBlock(el))) el = el.nextElementSibling;
      return el || null;
    };
    M.prevEditable = function prevEditable(el) {
      while (el && (el.tagName === 'HR' || M.isImageBlock(el))) el = el.previousElementSibling;
      return el || null;
    };
    M.insertParagraphAfter = function insertParagraphAfter(el) {
      var p = document.createElement('p');
      p.appendChild(document.createElement('br'));
      el.parentNode.insertBefore(p, el.nextSibling);
      return p;
    };
    M.placeAfter = function placeAfter(pre) {
      var next = M.nextEditable(pre.nextElementSibling);
      if (next) return next;
      var li = pre.parentNode && pre.parentNode.tagName === 'LI' ? pre.parentNode : null;
      if (li) {
        var more = M.nextEditable(li.nextElementSibling);
        if (more) return more;
        var list = li.parentNode;
        if (list && (list.tagName === 'UL' || list.tagName === 'OL')) {
          var afterList = M.nextEditable(list.nextElementSibling);
          if (afterList) return afterList;
          return M.insertParagraphAfter(list);
        }
      }
      return M.insertParagraphAfter(pre);
    };
    M.blockBefore = function blockBefore(pre) {
      var prev = M.prevEditable(pre.previousElementSibling);
      if (prev) return prev;
      var li = pre.parentNode && pre.parentNode.tagName === 'LI' ? pre.parentNode : null;
      if (!li) return null;
      var prevLi = M.prevEditable(li.previousElementSibling);
      if (prevLi) return prevLi;
      var list = li.parentNode;
      return list ? M.prevEditable(list.previousElementSibling) : null;
    };
    M.focusEdge = function focusEdge(el, atEnd) {
      if (!el || !M.editor) return;
      if (el.tagName === 'UL' || el.tagName === 'OL') {
        var lis = el.querySelectorAll('li');
        var li = atEnd ? lis[lis.length - 1] : lis[0];
        if (li) el = li;
      }
      if (!atEnd) {
        M.focusInside(el);
        return;
      }
      M.editor.focus();
      var sel = global.getSelection();
      var r = document.createRange();
      if (!el.firstChild || el.tagName === 'HR' || M.isImageBlock(el)) {
        r.setStart(el, el.childNodes.length);
        r.collapse(true);
      } else {
        r.selectNodeContents(el);
        r.collapse(false);
      }
      sel.removeAllRanges();
      sel.addRange(r);
      M.saveSel();
    };
    M.preBelowClick = function preBelowClick(y) {
      if (!M.editor) return null;
      var pres = M.editor.querySelectorAll('pre');
      var best = null;
      var bestBottom = -1;
      for (var i = 0; i < pres.length; i++) {
        var bottom = pres[i].getBoundingClientRect().bottom;
        if (y >= bottom - 2 && bottom >= bestBottom) {
          best = pres[i];
          bestBottom = bottom;
        }
      }
      if (!best) return null;
      var next = M.nextEditable(best.nextElementSibling);
      if (!next && best.parentNode && best.parentNode.tagName === 'LI') {
        next = M.nextEditable(best.parentNode.nextElementSibling);
        if (!next && best.parentNode.parentNode) next = M.nextEditable(best.parentNode.parentNode.nextElementSibling);
      }
      if (!next) return best;
      if (y < next.getBoundingClientRect().top - 2) return best;
      if (next.tagName === 'P' && !/\S/.test(next.textContent || '')) return best;
      return null;
    };
    M.ensureEditor = function ensureEditor() {
      if (!M.editor) return;
      if (!M.editor.firstElementChild) {
        var p = document.createElement('p');
        p.appendChild(document.createElement('br'));
        M.editor.appendChild(p);
      }
      M.ensureTail();
    };
    M.pruneEmpty = function pruneEmpty(el) {
      if (!el || el === M.editor || !el.parentNode) return;
      if ((el.tagName === 'UL' || el.tagName === 'OL') && !el.querySelector('li')) el.parentNode.removeChild(el);
    };
    M.fixImages = function fixImages() {
      if (!M.editor) return;
      Array.prototype.slice.call(M.editor.querySelectorAll('p > figure.dc-image, div > figure.dc-image')).forEach(function (fig) {
        var parent = fig.parentNode;
        // A picture is a direct child of the editor. Hoisting that match would
        // pull it out of the contenteditable onto the page, so it would not save.
        if (!parent || parent === M.editor) return;
        var host = parent.parentNode;
        if (!host || !M.editor.contains(parent)) return;
        host.insertBefore(fig, parent.nextSibling);
        if (parent !== M.editor && !/\S/.test(parent.textContent || '') && !parent.querySelector('figure, hr, img, li, pre')) host.removeChild(parent);
      });
      Array.prototype.forEach.call(M.editor.querySelectorAll('figure.dc-image'), function (fig) {
        fig.setAttribute('contenteditable', 'false');
        var img = fig.querySelector('img');
        if (img) img.setAttribute('draggable', 'false');
      });
    };
    M.watchImage = function watchImage(fig, img) {
      if (!img || img._dcWatch) return;
      img._dcWatch = true;
      img.addEventListener('load', function () {
        fig.classList.remove('is-loading');
        fig.classList.remove('is-broken');
      });
      img.addEventListener('error', function () {
        fig.classList.remove('is-loading');
        fig.classList.add('is-broken');
      });
      if (!img.getAttribute('src')) return;
      if (img.complete && img.naturalWidth) {
        fig.classList.remove('is-loading');
        fig.classList.remove('is-broken');
      } else if (img.complete) {
        fig.classList.remove('is-loading');
        fig.classList.add('is-broken');
      } else fig.classList.add('is-loading');
    };
    M.makeFigure = function makeFigure(src, alt) {
      var fig = document.createElement('figure');
      fig.className = 'dc-image';
      fig.setAttribute('contenteditable', 'false');
      fig.setAttribute('data-src', src);
      fig.setAttribute('data-alt', alt || '');
      var img = document.createElement('img');
      img.alt = alt || '';
      img.setAttribute('draggable', 'false');
      if (src.indexOf('upload:') !== 0) img.src = src;
      fig.appendChild(img);
      M.watchImage(fig, img);
      return fig;
    };
    },
    run: function (M) {
    M.previewTimer = null;
    M.previewChip = null;
    M.previewPinned = false;
    M.quick = null;
    }
  });
})(typeof window !== 'undefined' ? window : this);
