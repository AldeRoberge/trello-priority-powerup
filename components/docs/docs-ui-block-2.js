/**
 * docs-ui: mount() part 4 of 6.
 * The body of mount runs in order across these parts; its locals live on the per-call state object (M).
 * Order and shared names: see docs-ui.parts.json and docs/architecture.md.
 */
(function (global) {
  'use strict';

  var S = (global.DocsUiParts = global.DocsUiParts || {});
  var P = (global.DocsUiPartsMountMount = global.DocsUiPartsMountMount || { list: [] });

  P.list.push({
    define: function (M) {
    M.replaceBlock = function replaceBlock(block, node) {
      if (block.tagName !== 'LI') {
        block.parentNode.replaceChild(node, block);
        return;
      }
      var list = block.parentNode;
      var parent = list.parentNode;
      var next = block.nextSibling;
      var ref = list.nextSibling;
      list.removeChild(block);
      var rest = null;
      if (next) {
        rest = document.createElement(list.tagName);
        if (list.className) rest.className = list.className;
        while (next) {
          var n2 = next.nextSibling;
          rest.appendChild(next);
          next = n2;
        }
      }
      if (!list.querySelector('li')) {
        parent.removeChild(list);
        parent.insertBefore(node, ref);
      } else parent.insertBefore(node, list.nextSibling);
      if (rest && rest.childNodes.length) parent.insertBefore(rest, node.nextSibling);
    };
    M.insertNodeAfter = function insertNodeAfter(block, node) {
      if (block.tagName !== 'LI') {
        block.parentNode.insertBefore(node, block.nextSibling);
        return;
      }
      var list = block.parentNode;
      var parent = list.parentNode;
      var next = block.nextSibling;
      if (!next) {
        parent.insertBefore(node, list.nextSibling);
        return;
      }
      var rest = document.createElement(list.tagName);
      if (list.className) rest.className = list.className;
      while (next) {
        var n2 = next.nextSibling;
        rest.appendChild(next);
        next = n2;
      }
      parent.insertBefore(node, list.nextSibling);
      parent.insertBefore(rest, node.nextSibling);
    };
    M.commitImage = function commitImage(block, src, alt, replace) {
      var fig = M.makeFigure(src, alt);
      if (!block || !M.editor.contains(block)) {
        M.editor.appendChild(fig);
        return fig;
      }
      if (replace || M.isEmptyBlock(block) || M.isImageBlock(block) || block.tagName === 'HR') M.replaceBlock(block, fig);
      else M.insertNodeAfter(block, fig);
      return fig;
    };
    M.imageFileList = function imageFileList(list) {
      var out = [];
      if (!list) return out;
      for (var i = 0; i < list.length; i++) {
        if (list[i] && /^image\/(jpeg|png|webp|gif)$/.test(list[i].type)) out.push(list[i]);
      }
      return out;
    };
    M.imageFilesFrom = function imageFilesFrom(data) {
      if (!data) return [];
      var out = M.imageFileList(data.files);
      if (out.length || !data.items) return out;
      for (var i = 0; i < data.items.length; i++) {
        var it = data.items[i];
        if (it.kind === 'file' && /^image\/(jpeg|png|webp|gif)$/.test(it.type)) {
          var f = it.getAsFile();
          if (f) out.push(f);
        }
      }
      return out;
    };
    M.imageExt = function imageExt(file) {
      var t = String((file && file.type) || '').toLowerCase();
      if (t === 'image/png') return 'png';
      if (t === 'image/webp') return 'webp';
      if (t === 'image/gif') return 'gif';
      return 'jpg';
    };
    M.hydrateImages = function hydrateImages() {
      if (!M.editor || !S.DT() || typeof S.DT().coverBlobUrl !== 'function') return;
      Array.prototype.forEach.call(M.editor.querySelectorAll('figure.dc-image'), function (fig) {
        var src = fig.getAttribute('data-src') || '';
        if (src.indexOf('upload:') !== 0) return;
        var img = fig.querySelector('img');
        if (!img || img.getAttribute('data-hydrated') === src) return;
        var parts = src.slice(7).split('/');
        if (parts.length !== 3) return;
        fig.classList.add('is-loading');
        S.DT().coverBlobUrl(M.t, { k: 'upload', c: parts[0], a: parts[1], n: parts[2] }).then(function (url) {
          if (!img.isConnected) return;
          if (url) {
            img.src = url;
            img.setAttribute('data-hydrated', src);
            fig.classList.remove('is-loading');
            fig.classList.remove('is-broken');
          } else {
            fig.classList.remove('is-loading');
            fig.classList.add('is-broken');
          }
        }, function () {
          if (!fig.isConnected) return;
          fig.classList.remove('is-loading');
          fig.classList.add('is-broken');
        });
      });
    };
    M.insertImageFiles = function insertImageFiles(files, block, replace) {
      if (!M.state.current || !files.length) return;
      var anchor = block && M.editor.contains(block) ? block : M.editor.lastElementChild;
      var first = true;
      var chain = Promise.resolve();
      files.forEach(function (file) {
        chain = chain.then(function () {
          var rep = first && !!replace;
          first = false;
          return S.DT().uploadCover(M.t, M.state.current.id, file, M.imageExt(file)).then(function (cover) {
            if (!cover || !cover.a) throw new Error('upload-failed');
            var src = 'upload:' + cover.c + '/' + cover.a + '/' + cover.n;
            var alt = String(file.name || '').replace(/\.[^.]+$/, '').replace(/\s+/g, ' ').trim().slice(0, 200);
            anchor = M.commitImage(anchor, src, alt, rep);
          });
        });
      });
      chain.then(function () {
        M.ensureEditor();
        M.hydrateImages();
        M.onEdit();
        if (anchor && M.editor.contains(anchor)) M.showBlockUi(anchor);
      }, function (err) {
        M.toast(S.reasonText(err), 'error');
      });
    };
    M.openImagePopover = function openImagePopover(block, replace) {
      if (!block) return;
      M.closePop();
      var input = S.h('input', { class: 'dc-input', type: 'text', placeholder: 'https://…', 'aria-label': 'Adresse de l’image', spellcheck: 'false' });
      var file = S.h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp,image/gif', hidden: true });
      var err = S.h('div', { class: 'dc-pop-err', hidden: true });
      function applyUrl() {
        var src = S.DM().imageSrc(input.value);
        if (!src || src.indexOf('upload:') === 0) {
          err.hidden = false;
          err.textContent = 'Adresse non valide.';
          return;
        }
        M.closePop();
        var fig = M.commitImage(block, src, '', replace);
        M.ensureEditor();
        M.onEdit();
        if (fig) M.showBlockUi(fig);
      }
      file.addEventListener('change', function () {
        var picked = M.imageFileList(file.files);
        M.closePop();
        if (picked.length) M.insertImageFiles(picked, block, replace);
      });
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); applyUrl(); }
        else if (e.key === 'Escape') { e.preventDefault(); M.closePop(); }
      });
      M.pop = S.h('div', { class: 'dc-pop' }, [
        S.h('div', { class: 'dc-pop-row' }, [
          input,
          S.h('button', { class: 'dc-btn', type: 'button', title: 'Fichier', 'aria-label': 'Choisir un fichier', onclick: function () { file.click(); } }, [S.icon('upload')]),
        ]),
        err,
        file,
      ]);
      var anchor = M.els.blockUi && !M.els.blockUi.hidden ? M.els.blockUi : block;
      M.placePop(M.pop, anchor.getBoundingClientRect());
      input.focus();
    };
    M.plainFrom = function plainFrom(el) {
      var p = document.createElement('p');
      if (M.isImageBlock(el)) {
        var alt = el.getAttribute('data-alt') || '';
        if (alt) p.textContent = alt;
        else p.appendChild(document.createElement('br'));
      } else if (el.tagName === 'HR') {
        p.appendChild(document.createElement('br'));
      } else if (el.tagName === 'PRE' || el.tagName === 'BLOCKQUOTE') {
        var text = (el.textContent || '').replace(/\s+/g, ' ').trim();
        if (text) p.textContent = text;
        else p.appendChild(document.createElement('br'));
      } else {
        while (el.firstChild) p.appendChild(el.firstChild);
        if (!p.childNodes.length) p.appendChild(document.createElement('br'));
      }
      el.parentNode.replaceChild(p, el);
      return p;
    };
    M.blockKind = function blockKind(block) {
      if (!block) return '';
      if (M.isImageBlock(block)) return 'image';
      var tag = block.tagName;
      if (tag === 'HR') return 'hr';
      if (tag === 'PRE') return 'codeblock';
      if (tag === 'TABLE') return 'table';
      if (tag === 'BLOCKQUOTE') {
        var callout = block.getAttribute('data-callout');
        if (callout === 'note' || callout === 'tip' || callout === 'warning') return 'callout-' + callout;
        return 'quote';
      }
      if (tag === 'LI') {
        var list = block.parentNode;
        if (list.classList && list.classList.contains('dc-todo')) return 'todo';
        return list.tagName === 'OL' ? 'ol' : 'ul';
      }
      if (/^H[1-3]$/.test(tag)) return tag.toLowerCase();
      return 'p';
    };
    M.blockCommands = function blockCommands() {
      return S.COMMANDS.filter(function (c) {
        return !c.slashOnly && c.id !== 'mention-person' && c.id !== 'mention-task' && c.id !== 'mention-doc';
      });
    };
    M.transformBlock = function transformBlock(block, cmd) {
      if (!block || !M.editor || !M.editor.contains(block)) return;
      if (cmd === 'image') {
        M.openImagePopover(block, true);
        return;
      }
      if (block.tagName === 'BLOCKQUOTE' && (cmd === 'p' || cmd === 'quote') && M.docsRich()) {
        var turned = M.docsRich().unwrapQuote(block);
        if (turned) {
          M.focusInside(turned);
          M.onEdit();
          M.showBlockUi(M.currentRow() || turned);
        }
        return;
      }
      var target = block;
      if (M.isImageBlock(block) || block.tagName === 'HR' || block.tagName === 'PRE') target = M.plainFrom(block);
      M.focusInside(target);
      M.runCommand(cmd, { force: true });
      var row = M.currentRow();
      if (row) M.showBlockUi(row);
    };
    M.removeBlock = function removeBlock(block) {
      if (!block || !M.editor || !M.editor.contains(block)) return;
      var parent = block.parentNode;
      parent.removeChild(block);
      M.pruneEmpty(parent);
      M.ensureEditor();
      M.onEdit();
      M.hideBlockUi();
    };
    M.addBlockAfter = function addBlockAfter(block) {
      if (!block || !M.editor || !M.editor.contains(block)) return;
      M.closePop();
      var fresh;
      if (block.tagName === 'LI') {
        fresh = document.createElement('li');
        if (block.parentNode.classList && block.parentNode.classList.contains('dc-todo')) fresh.setAttribute('data-checked', 'false');
        fresh.appendChild(document.createElement('br'));
        block.parentNode.insertBefore(fresh, block.nextSibling);
      } else {
        fresh = document.createElement('p');
        fresh.appendChild(document.createElement('br'));
        block.parentNode.insertBefore(fresh, block.nextSibling);
      }
      M.focusInside(fresh);
      M.onEdit();
      M.showBlockUi(fresh);
      M.openBlockMenu(fresh, M.els.blockUi.querySelector('.dc-block-add'), true);
    };
    M.armFreshType = function armFreshType() {
      if (!M.editor) return;
      if (M.freshTypeOff) M.editor.removeEventListener('input', M.freshTypeOff);
      M.freshTypeOff = function () {
        M.editor.removeEventListener('input', M.freshTypeOff);
        M.freshTypeOff = null;
        if (M.pop && M.pop.classList.contains('dc-block-menu')) M.closePop();
      };
      M.editor.addEventListener('input', M.freshTypeOff);
    };
    M.openBlockMenu = function openBlockMenu(block, anchor, fresh) {
      if (!block || !anchor) return;
      M.closePop();
      var kind = M.blockKind(block);
      var items = M.blockCommands().map(function (cmd) {
        return S.h('button', {
          class: 'dc-menu-item' + (cmd.id === kind ? ' is-on' : ''),
          type: 'button',
          onclick: function () {
            M.closePop();
            M.transformBlock(block, cmd.id);
          },
        }, [S.icon(cmd.icon), S.h('span', { text: cmd.label })]);
      });
      items.push(S.h('div', { class: 'dc-menu-sep' }));
      items.push(S.h('button', {
        class: 'dc-menu-item is-danger',
        type: 'button',
        onclick: function () {
          M.closePop();
          M.removeBlock(block);
        },
      }, [S.icon('trash'), S.h('span', { text: 'Supprimer' })]));
      M.pop = S.h('div', { class: 'dc-pop dc-menu dc-block-menu', role: 'menu' }, items);
      M.pop._block = block;
      M.placePop(M.pop, anchor.getBoundingClientRect());
      if (fresh) M.armFreshType();
    };
    M.unwrapLi = function unwrapLi(li) {
      var nodes = [];
      var p = document.createElement('p');
      Array.prototype.slice.call(li.childNodes).forEach(function (k) {
        if (k.nodeType === 1 && (k.tagName === 'UL' || k.tagName === 'OL')) {
          if (!p.childNodes.length) p.appendChild(document.createElement('br'));
          nodes.push(p);
          p = document.createElement('p');
          nodes.push(k);
        } else p.appendChild(k);
      });
      if (p.childNodes.length) nodes.push(p);
      if (!nodes.length) {
        var empty = document.createElement('p');
        empty.appendChild(document.createElement('br'));
        nodes.push(empty);
      }
      return nodes;
    };
    M.moveBlock = function moveBlock(src, dest, before) {
      if (!src || !dest || src === dest || src.contains(dest)) return;
      var destParent = dest.parentNode;
      var ref = before ? dest : dest.nextSibling;
      if (ref === src) return;
      var srcParent = src.parentNode;
      if (srcParent === destParent) {
        srcParent.insertBefore(src, ref);
        return;
      }
      if (src.tagName === 'LI' && destParent === M.editor) {
        var nodes = M.unwrapLi(src);
        srcParent.removeChild(src);
        nodes.forEach(function (n) { M.editor.insertBefore(n, ref); });
        M.pruneEmpty(srcParent);
        return;
      }
      if (src.tagName === 'LI' && (destParent.tagName === 'UL' || destParent.tagName === 'OL')) {
        if (destParent.classList.contains('dc-todo')) {
          if (!src.hasAttribute('data-checked')) src.setAttribute('data-checked', 'false');
        } else src.removeAttribute('data-checked');
        destParent.insertBefore(src, ref);
        M.pruneEmpty(srcParent);
        return;
      }
      if (src.tagName !== 'LI' && (destParent.tagName === 'UL' || destParent.tagName === 'OL')) {
        var li = document.createElement('li');
        if (destParent.classList.contains('dc-todo')) li.setAttribute('data-checked', 'false');
        if (src.tagName === 'P' || /^H[1-6]$/.test(src.tagName)) {
          while (src.firstChild) li.appendChild(src.firstChild);
          if (!li.childNodes.length) li.appendChild(document.createElement('br'));
          srcParent.removeChild(src);
        } else li.appendChild(src);
        destParent.insertBefore(li, ref);
        return;
      }
      if (destParent === M.editor && srcParent === M.editor) M.editor.insertBefore(src, ref);
    };
    M.onEditorDragOver = function onEditorDragOver(e) {
      if (M.dragBlock) {
        var row = M.rowOf(e.target);
        if (!row || row === M.dragBlock || M.dragBlock.contains(row) || row.contains(M.dragBlock)) {
          M.els.dropLine.hidden = true;
          M.dropAt = null;
          return;
        }
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
        var r = row.getBoundingClientRect();
        var before = e.clientY < r.top + r.height / 2;
        M.dropAt = { row: row, before: before };
        M.placeDropLine(row, before);
        return;
      }
      var types = e.dataTransfer && e.dataTransfer.types;
      if (types && Array.prototype.indexOf.call(types, 'Files') >= 0) e.preventDefault();
    };
    M.onEditorDrop = function onEditorDrop(e) {
      if (M.dragBlock && M.dropAt) {
        e.preventDefault();
        var src = M.dragBlock;
        var at = M.dropAt;
        M.dragBlock = null;
        M.dropAt = null;
        M.els.dropLine.hidden = true;
        src.classList.remove('is-dragging');
        var beforeMd = M.lastDomMd();
        M.moveBlock(src, at.row, at.before);
        M.ensureEditor();
        if (M.editor.contains(src)) M.showBlockUi(M.rowOf(src) || src);
        if (M.lastDomMd() !== beforeMd) M.onEdit();
        return;
      }
      var files = M.imageFilesFrom(e.dataTransfer);
      if (!files.length) return;
      e.preventDefault();
      M.insertImageFiles(files, M.rowOf(e.target), false);
    };
    M.wireBlockUi = function wireBlockUi() {
      if (!M.els.blockUi) return;
      var addBtn = M.els.blockUi.querySelector('.dc-block-add');
      var grip = M.els.blockUi.querySelector('.dc-block-grip');
      addBtn.addEventListener('mousedown', function (e) {
        e.preventDefault();
        e.stopPropagation();
      });
      addBtn.addEventListener('click', function (e) {
        e.preventDefault();
        M.addBlockAfter(M.blockHover);
      });
      grip.addEventListener('mousedown', function (e) {
        e.stopPropagation();
        if (M.pop && !M.pop.classList.contains('dc-block-menu')) M.closePop();
      });
      grip.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        M.openBlockMenu(M.blockHover, grip, false);
      });
      grip.addEventListener('click', function (e) {
        e.preventDefault();
        if (M.gripDragged) return;
        if (M.pop && M.pop.classList.contains('dc-block-menu') && M.pop._block === M.blockHover) {
          M.closePop();
          return;
        }
        M.openBlockMenu(M.blockHover, grip, false);
      });
      grip.addEventListener('dragstart', function (e) {
        if (!M.blockHover) {
          e.preventDefault();
          return;
        }
        M.gripDragged = true;
        M.dragBlock = M.blockHover;
        M.dragBlock.classList.add('is-dragging');
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = 'move';
          try { e.dataTransfer.setData('text/plain', 'bloc'); } catch (err) { /* some browsers refuse */ }
          try { e.dataTransfer.setDragImage(M.dragBlock, 16, 16); } catch (err2) { /* ignore */ }
        }
        M.closePop();
      });
      grip.addEventListener('dragend', function () {
        if (M.dragBlock) M.dragBlock.classList.remove('is-dragging');
        M.dragBlock = null;
        M.dropAt = null;
        M.els.dropLine.hidden = true;
        setTimeout(function () { M.gripDragged = false; }, 0);
      });
      M.els.page.addEventListener('mouseover', function (e) {
        if (M.els.blockUi.contains(e.target)) {
          clearTimeout(M.blockHideTimer);
          return;
        }
        if (M.dragBlock) return;
        var row = M.rowOf(e.target);
        if (row) {
          clearTimeout(M.blockHideTimer);
          M.showBlockUi(row);
        } else M.scheduleHideBlock();
      });
      M.els.page.addEventListener('mouseleave', M.scheduleHideBlock);
    };
    M.buildToolbar = function buildToolbar() {
      var bar = M.els.toolbar;
      bar.textContent = '';
      function btn(cmd, iconName, title, extra) {
        return S.h('button', {
          class: 'dc-tb' + (extra ? ' ' + extra : ''),
          type: 'button',
          title: title,
          'aria-label': title,
          'data-cmd': cmd,
          onmousedown: function (e) { e.preventDefault(); },
          onclick: function () { M.runCommand(cmd); },
        }, [S.icon(iconName)]);
      }
      function sep() { return S.h('span', { class: 'dc-tb-sep', role: 'separator' }); }
      var blockSelect = S.h('select', {
        class: 'dc-select',
        'aria-label': 'Style de paragraphe',
        onchange: function () {
          var v = blockSelect.value;
          M.runCommand(v, { force: true });
        },
      }, [
        S.h('option', { value: 'p', text: 'Texte' }),
        S.h('option', { value: 'h1', text: 'Titre 1' }),
        S.h('option', { value: 'h2', text: 'Titre 2' }),
        S.h('option', { value: 'h3', text: 'Titre 3' }),
      ]);
      var side = S.h('button', {
        class: 'dc-tb dc-tb--side',
        type: 'button',
        title: 'Afficher / masquer la liste des documents',
        'aria-label': 'Afficher ou masquer la liste des documents',
        onclick: function () {
          M.state.sideCollapsed = !M.state.sideCollapsed;
          M.shell.classList.toggle('is-side-collapsed', M.state.sideCollapsed);
        },
      }, [S.icon('layout-sidebar')]);
      M.els.head.textContent = '';
      var mentionBtn = function (cmd, iconName, label, hint) {
        return S.h('button', {
          class: 'dc-tb dc-tb--text',
          type: 'button',
          title: label + ' (' + hint + ')',
          'data-cmd': cmd,
          onmousedown: function (e) { e.preventDefault(); },
          onclick: function () { M.runCommand(cmd); },
        }, [S.icon(iconName), S.h('span', { text: hint })]);
      };
      var more = S.h('button', {
        class: 'dc-tb',
        type: 'button',
        title: 'Actions du document',
        'aria-label': 'Actions du document',
        onclick: function (e) {
          e.stopPropagation();
          if (M.state.current) M.openDocMenu(more, M.state.current.id);
        },
      }, [S.icon('dots')]);
      function toolBtn(name, iconName, title, open) {
        var b = S.h('button', {
          class: 'dc-tb',
          type: 'button',
          title: title,
          'aria-label': title,
          'data-cmd': name,
          onmousedown: function (e) { e.preventDefault(); },
          onclick: function () { open(b); },
        }, [S.icon(iconName)]);
        return b;
      }
      var colorBtn = toolBtn('color', 'palette', 'Couleur', M.openColorPop);
      var calloutBtn = toolBtn('callout', 'note', 'Encadré', M.openCalloutMenu);
      var tableBtn = toolBtn('table', 'table', 'Tableau', function (b) {
        M.restoreSel();
        if (M.closestIn(M.selNode(), 'TABLE')) M.openTableMenu(b);
        else M.runCommand('table');
      });
      var alignBtn = toolBtn('align', 'align-center', 'Alignement', M.openAlignMenu);
      [side, S.icon('file-text', 'dc-head-icon'), M.els.headTitle, S.h('span', { class: 'dc-spacer' }), M.els.status, M.HP.button(M.shell), more].forEach(function (c) {
        M.els.head.appendChild(c);
      });
      [
        btn('undo', 'arrow-back-up', 'Annuler (Ctrl+Z)'),
        btn('redo', 'arrow-forward-up', 'Rétablir (Ctrl+Y)'),
        sep(),
        blockSelect,
        sep(),
        btn('bold', 'bold', 'Gras (Ctrl+B)'),
        btn('italic', 'italic', 'Italique (Ctrl+I)'),
        btn('underline', 'underline', 'Souligné (Ctrl+U)'),
        btn('strike', 'strikethrough', 'Barré (Ctrl+Maj+X)'),
        btn('code', 'code', 'Code (Ctrl+E)'),
        btn('link', 'link', 'Lier un document (Ctrl+K)'),
        btn('highlight', 'highlight', 'Surligner (Ctrl+Maj+H)'),
        colorBtn,
        sep(),
        btn('ul', 'list', 'Liste à puces (Ctrl+Maj+8)'),
        btn('ol', 'list-numbers', 'Liste numérotée (Ctrl+Maj+7)'),
        btn('todo', 'list-check', 'Liste de tâches (Ctrl+Maj+9)'),
        btn('quote', 'quote', 'Citation'),
        calloutBtn,
        btn('codeblock', 'file-code', 'Bloc de code'),
        btn('hr', 'separator-horizontal', 'Séparateur'),
        tableBtn,
        alignBtn,
        sep(),
        mentionBtn('mention-person', 'user', 'Mentionner une personne', '@'),
        mentionBtn('mention-task', 'checkbox', 'Lier une tâche', '@@'),
        mentionBtn('mention-doc', 'file-text', 'Lier un document', '@@@'),
      ].forEach(function (c) { bar.appendChild(c); });
    };
    M.fitTitle = function fitTitle() {
      var el = M.els.title;
      if (!el || M.els.scroll.hidden) return;
      el.style.height = 'auto';
      var h = el.scrollHeight;
      if (h > 0) el.style.height = h + 'px';
    };
    M.paintHead = function paintHead() {
      var title = M.state.current ? S.DM().cleanTitle(M.els.title.value) || S.DM().UNTITLED : '';
      M.els.headTitle.textContent = title;
      M.els.headTitle.title = title;
      M.els.head.classList.toggle('has-doc', !!M.state.current);
      M.fitTitle();
    };
    M.closeSuggest = function closeSuggest() {
      M.sugg = null;
      M.els.suggest.hidden = true;
      M.els.suggest.textContent = '';
    };
    M.updateSuggest = function updateSuggest() {
      if (!M.editor) return M.closeSuggest();
      var before = M.textBeforeCaret();
      if (before == null) return M.closeSuggest();
      var live = S.DL();
      if (live && !M.closestIn(M.selNode(), 'PRE,CODE')) {
        var wiki = live.wikiQuery(before);
        if (wiki) {
          var wgroups = S.DM().searchMentions(M.state.index, 'doc', wiki.query);
          var wentries = [];
          wgroups.forEach(function (g) {
            g.items.forEach(function (item) { wentries.push({ kind: 'item', item: item, group: g.label }); });
          });
          if (wiki.query.trim()) wentries.push({ kind: 'create', title: S.DM().cleanTitle(wiki.query) });
          var wkeep = M.sugg && M.sugg.kind === 'wiki' && M.sugg.trig.query === wiki.query ? M.sugg.active : 0;
          M.sugg = {
            kind: 'wiki',
            trig: { scope: 'doc', query: wiki.query, length: wiki.length },
            entries: wentries,
            groups: wgroups,
            active: Math.min(wkeep, Math.max(0, wentries.length - 1)),
          };
          M.paintSuggest();
          return;
        }
      }
      var trig = S.DM().detectTrigger(before);
      if (trig) {
        var groups = S.DM().searchMentions(M.state.index, trig.scope, trig.query);
        var entries = [];
        groups.forEach(function (g) {
          g.items.forEach(function (item) { entries.push({ kind: 'item', item: item, group: g.label }); });
        });
        if (trig.scope === 'doc' && trig.query.trim()) {
          entries.push({ kind: 'create', title: S.DM().cleanTitle(trig.query) });
        }
        if (trig.scope === 'all' && trig.query.trim()) {
          var names = ((M.state.index && M.state.index.person) || []).map(function (p) { return p.label; });
          var drafted = S.DM().personDraft(names, trig.query);
          if (drafted) entries.push({ kind: 'create-person', title: drafted });
        }
        var keep = M.sugg && M.sugg.kind === 'mention' && M.sugg.trig.scope === trig.scope && M.sugg.trig.query === trig.query ? M.sugg.active : 0;
        M.sugg = { kind: 'mention', trig: trig, entries: entries, groups: groups, active: Math.min(keep, Math.max(0, entries.length - 1)) };
        M.paintSuggest();
        return;
      }
      var sl = S.DM().detectSlash(before);
      if (sl) {
        var q = S.DM().fold(sl.query);
        var cmds = S.COMMANDS.filter(function (c) {
          return !q || S.DM().fold(c.label + ' ' + c.kw).indexOf(q) >= 0;
        });
        if (cmds.length) {
          M.sugg = { kind: 'slash', trig: sl, entries: cmds.map(function (c) { return { kind: 'cmd', cmd: c }; }), active: 0 };
          M.paintSuggest();
          return;
        }
      }
      M.closeSuggest();
    };
    M.caretRect = function caretRect() {
      var sel = global.getSelection();
      if (!sel.rangeCount) return null;
      var r = sel.getRangeAt(0).cloneRange();
      r.collapse(true);
      var rect = r.getClientRects()[0];
      if (rect && (rect.width || rect.height)) return rect;
      var block = M.closestIn(sel.anchorNode, S.BLOCK_SEL) || M.editor;
      return block.getBoundingClientRect();
    };
    M.paintSuggest = function paintSuggest() {
      var box = M.els.suggest;
      box.textContent = '';
      var s = M.sugg;
      if (!s) return;
      box.hidden = false;
      var title =
        s.kind === 'slash' ? 'Commandes' : s.trig.scope === 'task' ? 'Lier une tâche' : s.trig.scope === 'doc' ? 'Lier un document' : 'Mentionner';
      box.appendChild(
        S.h('div', { class: 'dc-sg-head' }, [S.h('span', { text: title })])
      );
      if (!s.entries.length) {
        box.appendChild(S.h('div', { class: 'dc-sg-none', text: 'Aucun résultat' }));
      }
      var lastGroup = '';
      s.entries.forEach(function (en, i) {
        if (en.kind === 'item' && s.trig.scope === 'all' && en.group !== lastGroup) {
          lastGroup = en.group;
          box.appendChild(S.h('div', { class: 'dc-sg-group', text: en.group }));
        }
        var row;
        if (en.kind === 'item') {
          var it = en.item;
          var lead =
            it.type === 'person'
              ? S.h('span', { class: 'dc-sg-avatar', text: it.initials || '?' })
              : S.icon(
                  it.type === 'task' ? (it.done ? 'circle-check' : 'checkbox') : it.type === 'entity' ? 'stack-2' : 'file-text',
                  'dc-sg-icon dc-sg-icon--' + it.type
                );
          row = S.h('div', { class: 'dc-sg-row' }, [
            lead,
            S.h('span', { class: 'dc-sg-label', text: it.label }),
            it.sub ? S.h('span', { class: 'dc-sg-sub', text: it.sub }) : null,
          ]);
        } else if (en.kind === 'create' || en.kind === 'create-person') {
          row = S.h('div', { class: 'dc-sg-row dc-sg-row--create' }, [
            S.icon('plus', 'dc-sg-icon dc-sg-icon--doc'),
            S.h('span', { class: 'dc-sg-label', text: (en.kind === 'create-person' ? 'Créer la personne « ' : 'Créer le document « ') + en.title + ' »' }),
          ]);
        } else {
          row = S.h('div', { class: 'dc-sg-row' }, [
            S.icon(en.cmd.icon, 'dc-sg-icon'),
            S.h('span', { class: 'dc-sg-label', text: en.cmd.label }),
            en.cmd.hint ? S.h('span', { class: 'dc-sg-sub', text: en.cmd.hint }) : null,
          ]);
        }
        row.setAttribute('role', 'option');
        row.setAttribute('data-i', String(i));
        if (i === s.active) row.classList.add('is-active');
        row.addEventListener('mousedown', function (e) {
          e.preventDefault();
          M.applySuggest(en);
        });
        row.addEventListener('mousemove', function () {
          if (M.sugg && M.sugg.active !== i) {
            M.sugg.active = i;
            M.markActive();
          }
        });
        box.appendChild(row);
      });
      M.placeSuggest();
    };
    M.markActive = function markActive() {
      Array.prototype.forEach.call(M.els.suggest.querySelectorAll('.dc-sg-row'), function (row) {
        var on = Number(row.getAttribute('data-i')) === M.sugg.active;
        row.classList.toggle('is-active', on);
        if (on && row.scrollIntoView) row.scrollIntoView({ block: 'nearest' });
      });
    };
    M.placeSuggest = function placeSuggest() {
      var rect = M.caretRect();
      var box = M.els.suggest;
      if (!rect) return;
      box.style.left = '0px';
      box.style.top = '0px';
      var bw = box.offsetWidth;
      var bh = box.offsetHeight;
      var vw = global.innerWidth;
      var vh = global.innerHeight;
      var left = Math.max(8, Math.min(rect.left, vw - bw - 8));
      var top = rect.bottom + 6;
      if (top + bh > vh - 8) top = Math.max(8, rect.top - bh - 6);
      box.style.left = left + 'px';
      box.style.top = top + 'px';
    };
    M.handleSuggestKey = function handleSuggestKey(e) {
      var s = M.sugg;
      if (!s) return false;
      if (e.key === 'Escape') {
        e.preventDefault();
        M.closeSuggest();
        return true;
      }
      if (!s.entries.length) return false;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        var n = s.entries.length;
        s.active = (s.active + (e.key === 'ArrowDown' ? 1 : n - 1)) % n;
        M.markActive();
        return true;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        M.applySuggest(s.entries[s.active]);
        return true;
      }
      return false;
    };
    M.plainChips = function plainChips(html) {
      return html.replace(/ contenteditable="false"/g, '');
    };
    M.withCompanion = function withCompanion(html) {
      var tpl = document.createElement('template');
      tpl.innerHTML = html;
      var nodes = tpl.content.childNodes;
      return nodes.length === 1 && nodes[0].nodeType === 1 ? html + '&#8203;' : html;
    };
    M.fixChips = function fixChips() {
      if (!M.editor) return;
      Array.prototype.forEach.call(M.editor.querySelectorAll('.dc-mention:not([contenteditable="false"]), .dc-ent:not([contenteditable="false"])'), function (chip) {
        chip.setAttribute('contenteditable', 'false');
      });
    };
    M.insertMention = function insertMention(item) {
      /* An entity keeps the typed words flush with the next letter. A zero-width
         space still stops Chrome from stripping the span's attributes. */
      var trail = item.type === 'entity' ? '&#8203;' : '&nbsp;';
      document.execCommand('insertHTML', false, M.plainChips(S.DM().mentionHtml(item.type, item.id, item.label)) + trail);
      M.fixChips();
      M.refreshChips();
      M.onEdit();
    };
    M.insertMentionAtRange = function insertMentionAtRange(range, item) {
      if (!M.editor || !range || !M.editor.contains(range.startContainer)) return false;
      M.editor.focus({ preventScroll: true });
      var sel = global.getSelection();
      sel.removeAllRanges();
      var restored = false;
      try {
        sel.addRange(range);
        restored = !sel.isCollapsed && M.editor.contains(sel.anchorNode);
      } catch (e) {
        restored = false;
      }
      if (restored) {
        M.insertMention(item);
        return true;
      }
      var tpl = document.createElement('template');
      tpl.innerHTML = M.plainChips(S.DM().mentionHtml(item.type, item.id, item.label));
      var chip = tpl.content.firstChild;
      if (!chip) return false;
      var space = document.createTextNode(item.type === 'entity' ? '\u200b' : '\u00a0');
      range.deleteContents();
      range.insertNode(space);
      range.insertNode(chip);
      M.fixChips();
      var caret = document.createRange();
      caret.setStartAfter(space);
      caret.collapse(true);
      sel.removeAllRanges();
      try { sel.addRange(caret); } catch (e2) { /* the caret stays where the browser left it */ }
      M.refreshChips();
      M.onEdit();
      return true;
    };
    M.dropSpaceAfterChip = function dropSpaceAfterChip() {
      var sel = global.getSelection();
      var n = sel && sel.anchorNode;
      if (!n || n.nodeType !== 3 || !sel.isCollapsed || sel.anchorOffset !== 2) return;
      var prev = n.previousSibling;
      if (prev && prev.nodeType === 1 && prev.classList.contains('dc-mention') && /^[\u00a0 ]{2}/.test(n.nodeValue)) {
        document.execCommand('delete');
      }
    };
    M.applySuggest = function applySuggest(entry) {
      var s = M.sugg;
      if (!s || !entry) return;
      M.closeSuggest();
      M.restoreSel();
      M.selectBackward(s.trig.length);
      if (entry.kind === 'item') {
        M.insertMention(entry.item);
      } else if (entry.kind === 'cmd') {
        document.execCommand('delete');
        var id = entry.cmd.id;
        M.saveSel();
        M.runCommand(id, { force: true });
      } else if (entry.kind === 'create') {
        document.execCommand('delete');
        M.saveSel();
        M.createFromMention(entry.title);
      } else if (entry.kind === 'create-person') {
        document.execCommand('delete');
        M.saveSel();
        M.createPersonMention(entry.title);
      }
    };
    M.createPersonMention = function createPersonMention(title) {
      var range = M.lastRange;
      M.savePerson(title).then(function (person) {
        if (!person) return;
        M.lastRange = range;
        M.restoreSel();
        M.insertMention({ type: 'person', id: person.id, label: person.name, initials: S.DM().initialsOf(person.name), contact: true });
      }, M.failure);
    };
    M.createFromMention = function createFromMention(title) {
      var range = M.lastRange;
      M.setBusy('Création du document…');
      S.DT().createDoc(M.t, title, '').then(
        function (doc) {
          M.setBusy('');
          M.state.docs.unshift({ id: doc.id, title: doc.title, updatedAt: doc.updatedAt });
          M.sortDocs();
          M.paintList();
          M.rebuildIndex();
          M.lastRange = range;
          M.restoreSel();
          M.insertMention({ type: 'doc', id: doc.id, label: doc.title });
          M.record({ type: 'create', targetId: doc.id, title: doc.title });
          M.toast('Document « ' + doc.title + ' » créé.', 'ok');
        },
        function (err) {
          M.setBusy('');
          M.failure(err);
        }
      );
    };
    M.hideSelBar = function hideSelBar() {
      if (M.selBar && M.selBar.parentNode) M.selBar.parentNode.removeChild(M.selBar);
      M.selBar = null;
    };
    M.rangeInOneMention = function rangeInOneMention(range) {
      if (!range) return false;
      var a = M.closestIn(range.startContainer, '.dc-mention');
      var b = M.closestIn(range.endContainer, '.dc-mention');
      return !!(a && a === b);
    };
    M.liveSelectionRange = function liveSelectionRange() {
      var sel = global.getSelection();
      if (
        sel && sel.rangeCount && !sel.isCollapsed && M.editor &&
        M.editor.contains(sel.anchorNode) && M.editor.contains(sel.focusNode)
      ) {
        return sel.getRangeAt(0).cloneRange();
      }
      return null;
    };
    M.selectionRange = function selectionRange() {
      var live = M.liveSelectionRange();
      if (live) return live;
      if (M.lastRange && !M.lastRange.collapsed && M.editor && M.editor.contains(M.lastRange.startContainer)) {
        return M.lastRange.cloneRange();
      }
      return null;
    };
    M.selectedDraft = function selectedDraft() {
      var range = M.liveSelectionRange();
      if (!range || M.rangeInOneMention(range)) return null;
      return S.DM().taskFromSelection(range.toString());
    };
    M.taskListPool = function taskListPool() {
      var lists = M.state.taskLists && M.state.taskLists.length ? M.state.taskLists : (M.state.sources && M.state.sources.lists) || [];
      return S.DM().taskListsForCreate(lists);
    };
    M.selectionClientRect = function selectionClientRect() {
      var sel = global.getSelection();
      if (!sel || !sel.rangeCount || sel.isCollapsed) return null;
      var live = sel.getRangeAt(0);
      var rects = live.getClientRects();
      var rect = rects.length ? rects[0] : live.getBoundingClientRect();
      if (!rect || (!rect.width && !rect.height)) return null;
      return rect;
    };
    M.placeSelBar = function placeSelBar() {
      if (!M.selBar) return;
      var rect = M.selectionClientRect();
      if (!rect) {
        if (!(M.pop && M.pop.classList.contains('dc-sel-pop'))) M.hideSelBar();
        return;
      }
      M.selBar.style.left = '0px';
      M.selBar.style.top = '0px';
      var w = M.selBar.offsetWidth;
      var hh = M.selBar.offsetHeight;
      var left = Math.max(8, Math.min(rect.left, global.innerWidth - w - 8));
      var top = rect.top - hh - 8;
      if (top < 8) top = Math.min(global.innerHeight - hh - 8, rect.bottom + 8);
      M.selBar.style.left = left + 'px';
      M.selBar.style.top = top + 'px';
    };
    M.updateSelBar = function updateSelBar() {
      if (!M.state.current || M.sugg) {
        M.hideSelBar();
        return;
      }
      if (!M.editorSelection()) {
        if (M.selBar && M.pop && M.pop.classList.contains('dc-sel-pop')) return;
        M.hideSelBar();
        return;
      }
      var lists = M.taskListPool();
      var shape = (M.selectedDraft() ? '1' : '0') + (lists.length > 1 ? '1' : '0') + (M.canCreateEntity() ? '1' : '0');
      if (M.selBar && M.selBar.parentNode && M.selBar.getAttribute('data-shape') === shape) {
        M.paintSelBarState();
        M.placeSelBar();
        return;
      }
      function keep(e) {
        e.preventDefault();
        M.holdSelection();
      }
      function ibtn(cmd, iconName, title) {
        return S.h('button', {
          class: 'dc-selbar-icon',
          type: 'button',
          title: title,
          'aria-label': title,
          'data-cmd': cmd,
          onmousedown: keep,
          onclick: function () {
            M.closePop();
            M.runCommand(cmd);
          },
        }, [S.icon(iconName)]);
      }
      function sep() { return S.h('span', { class: 'dc-selbar-sep', role: 'separator' }); }
      var parts = [
        S.h('button', {
          class: 'dc-selbar-style',
          type: 'button',
          title: 'Style',
          'aria-label': 'Style',
          onmousedown: keep,
          onclick: function (e) { M.openStyleMenu(e.currentTarget); },
        }, [S.h('span', { class: 'dc-selbar-style-label', text: 'Texte' }), S.icon('chevron-down')]),
        sep(),
        S.h('button', {
          class: 'dc-selbar-icon dc-selbar-color',
          type: 'button',
          title: 'Couleur',
          'aria-label': 'Couleur',
          onmousedown: keep,
          onclick: function (e) { M.openInkPopover(e.currentTarget); },
        }, [S.h('span', { class: 'dc-selbar-a', text: 'A' }), S.h('span', { class: 'dc-selbar-a-bar' })]),
        sep(),
        ibtn('bold', 'bold', 'Gras'),
        ibtn('italic', 'italic', 'Italique'),
        ibtn('underline', 'underline', 'Souligné'),
        ibtn('strike', 'strikethrough', 'Barré'),
        sep(),
        ibtn('link', 'link', 'Lier un document'),
        ibtn('ul', 'list', 'Liste à puces'),
        ibtn('ol', 'list-numbers', 'Liste numérotée'),
        S.h('button', {
          class: 'dc-selbar-icon',
          type: 'button',
          title: 'Plus',
          'aria-label': 'Plus',
          onmousedown: keep,
          onclick: function (e) { M.openSelMore(e.currentTarget); },
        }, [S.icon('dots')]),
      ];
      if (M.selectedDraft()) {
        parts.push(sep());
        parts.push(S.h('button', {
          class: 'dc-selbar-btn',
          type: 'button',
          onmousedown: keep,
          onclick: function () { M.createTaskFromSelection(); },
        }, [S.icon('plus'), S.h('span', { text: 'Créer une tâche' })]));
        if (lists.length > 1) {
          parts.push(S.h('button', {
            class: 'dc-selbar-btn dc-selbar-btn--more',
            type: 'button',
            title: 'Choisir la liste',
            'aria-label': 'Choisir la liste',
            onmousedown: keep,
            onclick: function (e) { M.openTaskListMenu(e.currentTarget); },
          }, [S.icon('chevron-down')]));
        }
        if (M.canCreateEntity()) {
          parts.push(S.h('button', {
            class: 'dc-selbar-btn',
            type: 'button',
            onmousedown: keep,
            onclick: function () { M.createEntityFromSelection(); },
          }, [S.icon('stack-2'), S.h('span', { text: 'Créer une entité' })]));
        }
      }
      M.hideSelBar();
      M.selBar = S.h('div', { class: 'dc-selbar', role: 'toolbar', 'aria-label': 'Sélection', 'data-shape': shape }, parts);
      M.shell.appendChild(M.selBar);
      M.paintSelBarState();
      M.placeSelBar();
    };
    M.openTaskListMenu = function openTaskListMenu(anchor) {
      var lists = M.taskListPool();
      if (!lists.length) return;
      var rect = anchor.getBoundingClientRect();
      var def = S.DM().defaultTaskListId(lists);
      M.saveSel();
      M.hideSelBar();
      M.closePop();
      M.pop = S.h('div', { class: 'dc-pop dc-menu', role: 'menu' }, lists.map(function (l) {
        return S.h('button', {
          class: 'dc-menu-item' + (String(l.id) === String(def) ? ' is-on' : ''),
          type: 'button',
          onclick: function () {
            M.closePop();
            M.createTaskFromSelection(String(l.id));
          },
        }, [S.icon(l.icon || 'circle'), S.h('span', { text: l.name || 'Liste' })]);
      }));
      M.placePop(M.pop, rect);
    };
    M.holdSelection = function holdSelection() {
      var live = M.liveSelectionRange();
      if (live) {
        M.heldRange = live;
        M.lastRange = live.cloneRange();
      }
      return M.heldRange;
    };
    M.editorSelection = function editorSelection() {
      var range = M.liveSelectionRange();
      if (!range || M.rangeInOneMention(range)) return null;
      if (!String(range.toString()).replace(/[\s\u200b\ufeff]/g, '')) return null;
      return range;
    };
    M.inkHost = function inkHost(node, kind) {
      var el = node && node.nodeType === 3 ? node.parentNode : node;
      while (el && el !== M.editor) {
        if (el.nodeType === 1) {
          if (kind === 'h' && el.tagName === 'MARK') return el;
          if (kind === 'c' && el.classList && el.classList.contains('dc-ink')) return el;
        }
        el = el.parentNode;
      }
      return null;
    };
    M.inkHere = function inkHere() {
      var n = M.selNode();
      var colorEl = M.inkHost(n, 'c');
      var hiEl = M.inkHost(n, 'h');
      return {
        color: colorEl ? colorEl.getAttribute('data-c') || '' : '',
        hi: hiEl ? (hiEl.getAttribute('data-c') || 'yellow') : '',
      };
    };
    M.slicesInRange = function slicesInRange(range) {
      var root = range.commonAncestorContainer;
      var rootEl = root.nodeType === 1 ? root : root.parentNode;
      if (!rootEl) return [];
      var walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT, null);
      var out = [];
      var node;
      while ((node = walker.nextNode())) {
        if (!node.nodeValue || !M.editor.contains(node) || M.closestIn(node, '.dc-mention')) continue;
        var hit = false;
        try { hit = range.intersectsNode(node); } catch (err) { hit = false; }
        if (!hit) continue;
        var start = node === range.startContainer ? range.startOffset : 0;
        var end = node === range.endContainer ? range.endOffset : node.nodeValue.length;
        if (start > end) { var swap = start; start = end; end = swap; }
        if (end > start) out.push({ node: node, start: start, end: end });
      }
      return out;
    };
    M.isolateText = function isolateText(node, start, end) {
      var text = node;
      if (start > 0) text = text.splitText(start);
      if (text.nodeValue && end - start < text.nodeValue.length) text.splitText(end - start);
      return text;
    };
    M.unwrapEl = function unwrapEl(el) {
      var parent = el.parentNode;
      if (!parent) return;
      while (el.firstChild) parent.insertBefore(el.firstChild, el);
      parent.removeChild(el);
    };
    M.pullOut = function pullOut(text, stop) {
      var node = text;
      while (node.parentNode && node.parentNode !== stop) {
        var parent = node.parentNode;
        var right = parent.cloneNode(false);
        while (node.nextSibling) right.appendChild(node.nextSibling);
        var mid = parent.cloneNode(false);
        mid.appendChild(node);
        parent.parentNode.insertBefore(mid, parent.nextSibling);
        if (right.childNodes.length) parent.parentNode.insertBefore(right, mid.nextSibling);
        if (!parent.childNodes.length) parent.parentNode.removeChild(parent);
        node = mid;
      }
      if (node.parentNode === stop) {
        var after = stop.cloneNode(false);
        while (node.nextSibling) after.appendChild(node.nextSibling);
        stop.parentNode.insertBefore(node, stop.nextSibling);
        if (after.childNodes.length) stop.parentNode.insertBefore(after, node.nextSibling);
        if (!stop.childNodes.length) stop.parentNode.removeChild(stop);
      }
      while (node && node.nodeType !== 3) node = node.firstChild;
      return node || text;
    };
    },
    run: function (M) {
    M.heldRange = null;
    M.SEL_INKS = [
      { id: 'gray', label: 'Gris', fg: '#626f86', bg: '#dfe1e6' },
      { id: 'brown', label: 'Brun', fg: '#8f6b4f', bg: '#f3e2d4' },
      { id: 'orange', label: 'Orange', fg: '#e56910', bg: '#ffe2bd' },
      { id: 'yellow', label: 'Jaune', fg: '#b38600', bg: '#f8e6a0' },
      { id: 'green', label: 'Vert', fg: '#1f845a', bg: '#d3f1a7' },
      { id: 'blue', label: 'Bleu', fg: '#0c66e4', bg: '#cce0ff' },
      { id: 'purple', label: 'Violet', fg: '#6e5dc6', bg: '#dfd8fd' },
      { id: 'pink', label: 'Rose', fg: '#cd519d', bg: '#fdd0ec' },
      { id: 'red', label: 'Rouge', fg: '#c9372c', bg: '#ffd2d2' },
    ];
    M.STYLE_LABEL = { p: 'Texte', h1: 'Titre 1', h2: 'Titre 2', h3: 'Titre 3' };
    }
  });
})(typeof window !== 'undefined' ? window : this);
