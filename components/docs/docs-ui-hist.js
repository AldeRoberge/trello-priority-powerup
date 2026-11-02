/**
 * docs-ui: mount() part 6 of 6.
 * The body of mount runs in order across these parts; its locals live on the per-call state object (M).
 * Order and shared names: see docs-ui.parts.json and docs/architecture.md.
 */
(function (global) {
  'use strict';

  var S = (global.DocsUiParts = global.DocsUiParts || {});
  var P = (global.DocsUiPartsMountMount = global.DocsUiPartsMountMount || { list: [] });

  P.list.push({
    define: function (M) {
    M.openCoverPicker = function openCoverPicker(rect) {
      M.closePop();
      if (!M.state.current) return;
      var tab = S.recall(M.COVER_TAB_KEY);
      if (!M.COVER_TABS.some(function (x) { return x[0] === tab; })) tab = 'color';
      var tabBar = S.h('div', { class: 'dc-cover-tabs', role: 'tablist' });
      var body = S.h('div', { class: 'dc-cover-body' });
      var query = '';
      var searchTimer = null;
      var searchToken = 0;

      function current() {
        return M.state.current && M.state.current.cover;
      }

      function swatch(cover, style, label) {
        var on = S.DM().sameCover(current(), cover);
        var b = S.h('button', {
          class: 'dc-swatch' + (on ? ' is-on' : ''),
          type: 'button',
          title: label,
          'aria-label': label,
          'aria-pressed': on ? 'true' : 'false',
          onclick: function () { M.setCover(cover); },
        });
        b.style.background = style;
        return b;
      }

      function paintTabs() {
        tabBar.textContent = '';
        M.COVER_TABS.forEach(function (x) {
          tabBar.appendChild(
            S.h('button', {
              class: 'dc-cover-tab' + (x[0] === tab ? ' is-on' : ''),
              type: 'button',
              role: 'tab',
              'aria-selected': x[0] === tab ? 'true' : 'false',
              onclick: function () {
                tab = x[0];
                S.remember(M.COVER_TAB_KEY, tab);
                paint();
              },
            }, [x[1]])
          );
        });
      }

      function photoGrid(list, box) {
        box.textContent = '';
        if (!list.length) {
          box.appendChild(S.h('p', { class: 'dc-cover-none', text: 'Aucune photo.' }));
          return;
        }
        var cur = current();
        list.forEach(function (p) {
          var on = cur && cur.k === 'unsplash' && cur.v === p.v;
          var img = S.h('img', { alt: '', loading: 'lazy', src: S.DM().unsplashUrl(p.v, 400, p.x) });
          box.appendChild(
            S.h('button', {
              class: 'dc-cover-thumb' + (on ? ' is-on' : ''),
              type: 'button',
              title: p.by ? 'Photo : ' + p.by : 'Photo Unsplash',
              onclick: function () { M.setCover(p); },
            }, [img])
          );
        });
      }

      function runSearch(grid) {
        var token = ++searchToken;
        var local = S.DM().searchGallery(query);
        if (!query.trim() || !M.unsplashRemote) return photoGrid(local, grid);
        grid.classList.add('is-loading');
        S.DT().searchUnsplash(M.t, query).then(
          function (res) {
            if (token !== searchToken) return;
            grid.classList.remove('is-loading');
            if (res === null) M.unsplashRemote = false;
            photoGrid(res === null ? local : res, grid);
          },
          function () {
            if (token !== searchToken) return;
            grid.classList.remove('is-loading');
            photoGrid(local, grid);
          }
        );
      }

      function paintUpload() {
        var file = S.h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp,image/gif', hidden: true });
        var err = S.h('div', { class: 'dc-pop-err', hidden: true });
        var label = S.h('span', { text: 'Choisir une image' });
        var drop = S.h('button', { class: 'dc-cover-drop', type: 'button', onclick: function () { file.click(); } }, [S.icon('upload'), label]);
        function showErr(msg) {
          err.hidden = !msg;
          err.textContent = msg || '';
        }
        function upload(f) {
          if (!f || !M.state.current) return;
          var cur = M.state.current;
          showErr('');
          drop.disabled = true;
          drop.classList.add('is-busy');
          label.textContent = 'Envoi…';
          M.prepareCoverImage(f)
            .then(function (p) { return S.DT().uploadCover(M.t, cur.id, p.blob, p.ext); })
            .then(
              function (cover) {
                drop.disabled = false;
                drop.classList.remove('is-busy');
                label.textContent = 'Choisir une image';
                if (M.state.current === cur) M.setCover(cover);
              },
              function (e) {
                drop.disabled = false;
                drop.classList.remove('is-busy');
                label.textContent = 'Choisir une image';
                showErr(e && e.reason ? S.reasonText(e) : (e && e.message) || 'Envoi impossible.');
              }
            );
        }
        file.addEventListener('change', function () { upload(file.files && file.files[0]); });
        drop.addEventListener('dragover', function (e) { e.preventDefault(); drop.classList.add('is-over'); });
        drop.addEventListener('dragleave', function () { drop.classList.remove('is-over'); });
        drop.addEventListener('drop', function (e) {
          e.preventDefault();
          drop.classList.remove('is-over');
          upload(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]);
        });
        var link = S.h('input', { class: 'dc-input dc-cover-link', type: 'url', placeholder: 'Coller un lien d’image…', 'aria-label': 'Lien d’une image', spellcheck: 'false' });
        function applyLink() {
          var c = S.DM().coverFromLink(link.value);
          if (!c) return showErr('Lien non valide (https).');
          showErr('');
          M.setCover(c);
        }
        link.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') { e.preventDefault(); applyLink(); }
        });
        link.addEventListener('paste', function () { setTimeout(applyLink, 0); });
        body.appendChild(drop);
        body.appendChild(file);
        body.appendChild(S.h('div', { class: 'dc-cover-or', text: 'ou' }));
        body.appendChild(link);
        body.appendChild(err);
      }

      function paint() {
        paintTabs();
        body.textContent = '';
        body.className = 'dc-cover-body is-' + tab;
        if (tab === 'color') {
          var grid = S.h('div', { class: 'dc-cover-grid' });
          S.DM().COVER_COLORS.forEach(function (c) { grid.appendChild(swatch({ k: 'color', v: c.v }, c.v, c.label)); });
          body.appendChild(grid);
        } else if (tab === 'gradient') {
          var grid2 = S.h('div', { class: 'dc-cover-grid' });
          S.DM().COVER_GRADIENTS.forEach(function (g) { grid2.appendChild(swatch({ k: 'gradient', v: g.id }, g.css, g.label)); });
          body.appendChild(grid2);
        } else if (tab === 'unsplash') {
          var input = S.h('input', { class: 'dc-input dc-cover-search', type: 'search', placeholder: 'Rechercher des photos…', 'aria-label': 'Rechercher sur Unsplash', value: query });
          var photos = S.h('div', { class: 'dc-cover-photos' });
          input.addEventListener('input', function () {
            query = input.value;
            clearTimeout(searchTimer);
            searchTimer = setTimeout(function () { runSearch(photos); }, 350);
          });
          body.appendChild(input);
          body.appendChild(photos);
          runSearch(photos);
          setTimeout(function () { input.focus(); }, 0);
        } else {
          paintUpload();
        }
      }

      M.pop = S.h('div', { class: 'dc-pop dc-cover-pop', role: 'dialog', 'aria-label': 'Couverture' }, [tabBar, body]);
      M.pop._paint = function () {
        // keep the search results and the upload field: only the selection marks change
        if (tab === 'color' || tab === 'gradient') paint();
        else if (tab === 'unsplash') {
          var cur = current();
          Array.prototype.forEach.call(M.pop.querySelectorAll('.dc-cover-thumb'), function (b) {
            var img = b.querySelector('img');
            b.classList.toggle('is-on', !!(cur && cur.k === 'unsplash' && img && img.src.indexOf('/' + cur.v + '?') >= 0));
          });
        }
      };
      paint();
      M.placePop(M.pop, rect);
    };
    M.dialog = function dialog(opts) {
      return new Promise(function (resolve) {
        var overlay = S.h('div', { class: 'dc-overlay', role: 'dialog', 'aria-modal': 'true', 'aria-label': opts.title });
        function done(v) {
          if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
          resolve(v);
        }
        if (opts.picks) {
          overlay.appendChild(S.h('div', { class: 'dc-dialog dc-dialog--arch' }, [
            S.h('h2', { class: 'dc-dialog-title', text: opts.title }),
            S.h('div', { class: 'dc-arch-picks' }, opts.picks.map(function (p) {
              return S.h('button', {
                class: 'dc-arch-pick',
                type: 'button',
                onclick: function () { done(p.value); },
              }, [p.scene, S.h('span', { class: 'dc-arch-label', text: p.label })]);
            })),
            S.h('button', { class: 'dc-arch-cancel', type: 'button', onclick: function () { done(false); } }, [opts.cancel || 'Annuler']),
          ]));
          overlay.addEventListener('keydown', function (e) { if (e.key === 'Escape') done(false); });
          overlay.addEventListener('mousedown', function (e) { if (e.target === overlay) done(false); });
          M.shell.appendChild(overlay);
          var firstPick = overlay.querySelector('.dc-arch-pick');
          if (firstPick) firstPick.focus();
          return;
        }
        var alt = opts.alt ? S.h('button', { class: 'dc-btn', type: 'button', onclick: function () { done('alt'); } }, [opts.alt]) : null;
        var cancel = S.h('button', { class: 'dc-btn', type: 'button', onclick: function () { done(false); } }, [opts.cancel || 'Annuler']);
        var field = opts.input != null ? S.h('input', { class: 'dc-dialog-input', type: 'text', maxlength: String(S.DM().MAX_FOLDER_NAME), value: opts.input }) : null;
        var ok = S.h('button', { class: 'dc-btn ' + (opts.danger ? 'dc-btn--danger' : 'dc-btn--primary'), type: 'button', onclick: function () { done(field ? field.value : true); } }, [opts.ok || 'OK']);
        if (field) field.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); done(field.value); } });
        overlay.appendChild(S.h('div', { class: 'dc-dialog' }, [
          S.h('h2', { class: 'dc-dialog-title', text: opts.title }),
          S.h('p', { class: 'dc-dialog-text', text: opts.text }),
          field,
          S.h('div', { class: 'dc-dialog-actions' }, [cancel, alt, ok]),
        ]));
        overlay.addEventListener('keydown', function (e) { if (e.key === 'Escape') done(false); });
        overlay.addEventListener('mousedown', function (e) { if (e.target === overlay) done(false); });
        M.shell.appendChild(overlay);
        (field || (opts.danger ? cancel : ok)).focus();
      });
    };
    M.leaveArchivedDoc = function leaveArchivedDoc() {
      M.state.current = null;
      S.remember(S.LAST_KEY, null);
      M.showCurrent();
      var next = M.state.docs.filter(function (x) { return !(M.state.idx.archived || {})[x.id]; })[0];
      if (next) M.openDoc(next.id, { skipSave: true });
    };
    M.confirmDelete = function confirmDelete(docId) {
      var d = M.state.docs.filter(function (x) { return x.id === docId; })[0];
      if (!d) return;
      var wasCurrent = M.state.current && M.state.current.id === docId;
      M.editFolders(function (idx) { S.DM().archiveDocIn(idx, docId); }, 'Document archivé.').then(function (ok) {
        if (ok && wasCurrent && !M.state.showArchived) M.leaveArchivedDoc();
      });
    };
    M.restoreDoc = function restoreDoc(docId) {
      M.editFolders(function (idx) { S.DM().restoreDocIn(idx, docId); }, 'Document restauré.');
    };
    M.exportDoc = function exportDoc(docId, mode) {
      var load = M.state.current && M.state.current.id === docId
        ? Promise.resolve({ title: M.els.title.value || M.state.current.title, body: M.lastDomMd() })
        : S.DT().loadDoc(M.t, docId);
      load.then(function (doc) {
        var text = S.DM().exportMarkdown(doc.title, doc.body);
        if (mode === 'copy') {
          M.copyText(text);
          return;
        }
        try {
          var blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
          var url = URL.createObjectURL(blob);
          var a = S.h('a', { href: url, download: (S.DM().cleanTitle(doc.title) || 'document').replace(/[\\/:*?"<>|]/g, '-') + '.md' });
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
          M.toast('Fichier .md prêt.', 'ok');
        } catch (e) {
          M.copyText(text);
        }
      }, M.failure);
    };
    M.copyText = function copyText(text) {
      function legacy() {
        var ta = S.h('textarea', { style: 'position:fixed;opacity:0;left:-9999px' });
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        var ok = false;
        try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
        document.body.removeChild(ta);
        M.toast(ok ? 'Markdown copié.' : 'Copie impossible depuis cette fenêtre.', ok ? 'ok' : 'error');
      }
      if (global.navigator && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { M.toast('Markdown copié.', 'ok'); }, legacy);
      } else legacy();
    };
    M.setBusy = function setBusy(msg) {
      M.state.busy = msg || '';
      M.shell.classList.toggle('is-busy', !!msg);
      if (msg) M.toast(msg);
    };
    M.failure = function failure(err) {
      if (S.isAuthReason(err)) {
        M.state.authOk = false;
        M.paintBanner();
      }
      M.toast(S.reasonText(err), 'error');
    };
    M.showCurrent = function showCurrent() {
      var has = !!M.state.current;
      M.els.scroll.hidden = !has;
      M.els.toolbar.classList.toggle('is-disabled', !has);
      M.els.empty.hidden = has || !M.state.docsLoaded;
      M.paintHead();
      if (!has) M.state.face = null;
      M.paintProps();
      if (!has) {
        M.editor = null;
        M.paintCover();
        M.els.outline.textContent = '';
        M.els.outline.classList.add('is-empty');
        M.els.conflict.hidden = true;
        M.paintStatus();
        M.paintEmpty();
      }
    };
    M.paintEmpty = function paintEmpty() {
      var e = M.els.empty;
      e.textContent = '';
      if (!M.state.authOk) {
        e.appendChild(S.icon('lock', 'dc-empty-icon'));
        e.appendChild(S.h('h2', { text: 'Autorisation Trello requise' }));
        e.appendChild(M.authButton());
        return;
      }
      e.appendChild(S.icon('file-text', 'dc-empty-icon'));
      e.appendChild(S.h('h2', { text: M.state.docs.length ? 'Aucun document sélectionné' : 'Aucun document' }));
      e.appendChild(S.h('button', { class: 'dc-btn dc-btn--primary', onclick: function () { M.newDoc(); } }, [S.icon('plus'), 'Nouveau document']));
    };
    M.isDayPage = function isDayPage() {
      return !!(M.state.current && M.state.current.subject && M.state.current.subject.k === 'day');
    };
    M.followCheckbox = function followCheckbox(li) {
      if (!M.isDayPage() || !S.DT().setTaskDone) return;
      var chip = li.querySelector('.dc-mention--task');
      var id = chip && chip.getAttribute('data-id');
      if (!id) return;
      var on = li.getAttribute('data-checked') === 'true';
      S.DT().setTaskDone(M.t, id, on).then(function () {
        M.loadSources().catch(function () {});
      }, function () {
        li.setAttribute('data-checked', on ? 'false' : 'true');
        M.onEdit();
        M.toast('La tâche n’a pas pu être mise à jour.', 'error');
      });
    };
    M.syncDayPage = function syncDayPage() {
      clearTimeout(M.daySyncTimer);
      M.daySyncTimer = setTimeout(function () {
        if (!M.isDayPage() || !M.editor || !global.DocsDaily || M.editor.contains(document.activeElement)) return;
        var cur = M.state.current;
        var md = S.DM().domToMd(M.editor);
        if (!global.DocsDaily.reconcile(md).create.length) return;
        M.saveNow().then(function (ok) {
          if (!ok || M.state.current !== cur) return;
          return M.openDoc(cur.id, { reload: true, skipSave: true });
        });
      }, 700);
    };
    M.openDoc = function openDoc(id, opts) {
      opts = opts || {};
      if (M.state.current && M.state.current.id === id && !opts.reload) return Promise.resolve();
      M.closeSuggest();
      M.closePop();
      var token = ++M.loadToken;
      var pre = M.state.current && !opts.skipSave ? M.saveNow() : Promise.resolve(true);
      return pre.then(function (ok) {
        if (token !== M.loadToken) return;
        if (!ok && M.state.current && (M.state.saveState === 'error' || M.state.saveState === 'conflict') && !M.readDraft(M.state.current.id)) {
          return M.dialog({
            title: 'Changer de document ?',
            text: 'Les dernières modifications de « ' + (M.state.current.title || 'ce document') + ' » n’ont pas pu être enregistrées. Elles seront perdues.',
            ok: 'Abandonner mes changements',
            cancel: 'Rester',
            danger: true,
          }).then(function (yes) {
            if (yes) return load();
          });
        }
        return load();
      });

      function load() {
        M.els.page.classList.add('is-loading');
        M.histFlush();
        var target = M.state.docs.filter(function (x) { return x.id === id; })[0];
        var prep = target && target.subject && target.subject.k === 'day' && S.DT().refreshDaily
          ? S.DT().refreshDaily(M.t).catch(function () {})
          : Promise.resolve();
        return prep.then(function () { return S.DT().loadDoc(M.t, id); }).then(
          function (doc) {
            if (token !== M.loadToken) return;
            M.els.page.classList.remove('is-loading');
            M.state.current = doc;
            M.histBase(doc);
            M.savedTitle = doc.title;
            M.els.title.value = doc.title === S.DM().UNTITLED ? '' : doc.title;
            M.fitTitle();
            M.els.conflict.hidden = true;
            M.state.conflict = null;
            M.showCurrent();
            M.rebuildIndex();
            M.buildEditor(doc);
            M.setSave('saved');
            M.restoreDraft(doc);
            S.remember(S.LAST_KEY, id);
            M.paintList();
            M.els.scroll.scrollTop = 0;
            if (opts.focusTitle) {
              M.els.title.focus();
              M.els.title.select();
            }
          },
          function (err) {
            M.els.page.classList.remove('is-loading');
            if (token !== M.loadToken) return;
            if ((err && err.reason) === 'http-404' || (err && err.reason) === 'not-a-document') {
              M.state.docs = M.state.docs.filter(function (d) { return d.id !== id; });
              M.paintList();
            }
            M.failure(err);
          }
        );
      }
    };
    M.newDoc = function newDoc(title, body, folderId, parentDocId, cover) {
      if (M.state.busy) return;
      var go = M.state.current ? M.saveNow() : Promise.resolve(true);
      go.then(function () {
        M.setBusy('Création du document…');
        S.DT().createDoc(M.t, title || S.DM().UNTITLED, body || '', { cover: cover }).then(
          function (doc) {
            M.setBusy('');
            M.toast('');
            M.record({ type: 'create', targetId: doc.id, title: doc.title });
            M.state.docs.unshift({ id: doc.id, title: doc.title, updatedAt: doc.updatedAt });
            M.sortDocs();
            M.state.filter = '';
            M.els.search.value = '';
            var placed = Promise.resolve();
            if (folderId) {
              M.setFolderOpen(folderId, true);
              M.moveDocToFolder(doc.id, folderId);
            } else if (parentDocId) {
              placed = M.nestDoc(doc.id, parentDocId) || Promise.resolve();
            }
            placed.then(function () {
              M.openDoc(doc.id, { skipSave: true, focusTitle: !title });
            });
          },
          function (err) {
            M.setBusy('');
            M.failure(err);
          }
        );
      });
    };
    M.duplicateDoc = function duplicateDoc(docId) {
      var src = M.state.current && M.state.current.id === docId
        ? Promise.resolve({ title: M.els.title.value || M.state.current.title, body: M.lastDomMd(), cover: M.state.current.cover })
        : S.DT().loadDoc(M.t, docId);
      src.then(function (doc) {
        M.newDoc(S.DM().cleanTitle((doc.title || S.DM().UNTITLED) + ' (copie)'), doc.body, null, null, doc.cover);
      }, M.failure);
    };
    /* An unsent copy from an earlier session or a failed save wins over the stored version: it is then saved, or goes through the usual conflict choice. */
    M.restoreDraft = function restoreDraft(doc) {
      var dr = M.readDraft(doc.id);
      if (!dr || !M.editor) return;
      if (dr.body === doc.body && dr.title === doc.title) { M.clearDraft(doc.id); return; }
      if (typeof dr.body === 'string' && dr.body !== doc.body) {
        M.editor.innerHTML = S.DM().mdToHtml(dr.body);
        M.ensureTail();
        M.fixImages();
        M.fixTables();
        M.hydrateImages();
        M.refreshChips();
      }
      if (typeof dr.title === 'string' && dr.title !== doc.title) {
        M.els.title.value = dr.title === S.DM().UNTITLED ? '' : dr.title;
        M.fitTitle();
        doc.title = dr.title;
      }
      doc.rev = dr.rev != null ? dr.rev : doc.rev;
      M.paintEmptyClass();
      M.setSave('dirty');
      M.scheduleSave(300);
    };
    M.draftKey = function draftKey(id) { return 'doc.' + id; };
    M.readDraft = function readDraft(id) { return global.Connection ? global.Connection.readDraft(M.draftKey(id)) : null; };
    M.clearDraft = function clearDraft(id) { if (global.Connection) global.Connection.clearDraft(M.draftKey(id)); };
    /* Every unsent edit is copied to this device first, so a failed save, a closed tab or a lost connection never loses it. */
    M.keepDraft = function keepDraft() {
      var cur = M.state.current;
      if (!cur || !M.editor || !global.Connection) return;
      var md = S.DM().domToMd(M.editor);
      var title = S.DM().cleanTitle(M.els.title.value) || S.DM().UNTITLED;
      if (md === M.lastMd && title === M.savedTitle) { M.clearDraft(cur.id); return; }
      global.Connection.writeDraft(M.draftKey(cur.id), { body: md, title: title, rev: cur.rev });
    };
    M.scheduleSave = function scheduleSave(ms) {
      M.keepDraft();
      clearTimeout(M.saveTimer);
      M.saveTimer = setTimeout(function () { M.saveNow(); }, ms == null ? S.SAVE_DELAY_MS : ms);
    };
    M.saveNow = function saveNow(opts) {
      opts = opts || {};
      clearTimeout(M.saveTimer);
      if (!M.state.current || !M.editor) return Promise.resolve(true);
      if (M.saving) {
        return new Promise(function (resolve) {
          setTimeout(function () { resolve(M.saveNow(opts)); }, 150);
        });
      }
      if (M.state.saveState === 'conflict' && !opts.force) return Promise.resolve(false);
      var cur = M.state.current;
      var md = S.DM().domToMd(M.editor);
      var want = S.DM().cleanTitle(M.els.title.value) || S.DM().UNTITLED;
      var bodyChanged = md !== M.lastMd;
      var titleChanged = want !== M.savedTitle;
      if (!bodyChanged && !titleChanged && !opts.force) {
        if (M.state.saveState !== 'saved') M.setSave('saved');
        return Promise.resolve(true);
      }
      if (bodyChanged && S.DM().sizeInfo(md).over) {
        M.setSave('error', 'Document trop long : réduisez-le pour enregistrer.');
        return Promise.resolve(false);
      }
      M.keepDraft();
      if (global.Connection && global.Connection.offline() && !opts.force) {
        M.setSave('offline');
        M.retryLater();
        return Promise.resolve(false);
      }
      M.saving = true;
      M.setSave('saving');
      var chain = Promise.resolve();
      if (titleChanged) {
        chain = chain.then(function () {
          return S.DT().renameDoc(M.t, cur.id, want).then(function (r) {
            var oldTitle = M.savedTitle;
            M.savedTitle = r.title;
            cur.title = r.title;
            M.histRenamed(cur.id, oldTitle, r.title);
            M.touchListItem(cur.id, { title: r.title });
            M.syncFolderName(cur.id, r.title);
            if (cur.subject && cur.subject.k === 'project' && S.DT().syncProjectTitle) {
              S.DT().syncProjectTitle(M.t, cur.subject.id, r.title).catch(function () {});
            }
            M.rebuildIndex();
          });
        });
      }
      if (bodyChanged || opts.force) {
        chain = chain.then(function () {
          var coverAt = cur.cover || null;
          return S.DT().saveDoc(M.t, { id: cur.id, body: md, rev: cur.rev, cover: coverAt }, { force: !!opts.force }).then(function (res) {
            cur.rev = res.rev;
            cur.updatedAt = res.updatedAt;
            cur.body = md;
            cur.savedCover = coverAt;
            M.lastMd = md;
            M.histBodySaved();
            M.touchListItem(cur.id, { updatedAt: res.updatedAt, size: md.length });
          });
        });
      }
      return chain.then(
        function () {
          M.saving = false;
          if (M.state.current !== cur) return true;
          var stillDirty = M.editor && (S.DM().domToMd(M.editor) !== M.lastMd || (S.DM().cleanTitle(M.els.title.value) || S.DM().UNTITLED) !== M.savedTitle);
          M.keepDraft();
          M.setSave(stillDirty ? 'dirty' : 'saved');
          if (stillDirty) M.scheduleSave(300);
          M.paintMeta();
          return !stillDirty;
        },
        function (err) {
          M.saving = false;
          if (err && err.reason === 'conflict') {
            M.state.conflict = err.remote;
            M.setSave('conflict', 'Modifié ailleurs');
            M.paintConflict();
          } else if (global.Connection && global.Connection.isNetworkError(err)) {
            M.setSave('offline');
            M.retryLater();
          } else {
            if (S.isAuthReason(err)) {
              M.state.authOk = false;
              M.paintBanner();
            }
            M.setSave('error', S.reasonText(err));
          }
          return false;
        }
      );
    };
    /* While offline the spinner is honest: we retry every few seconds and as soon as the browser says the network is back. */
    M.retryLater = function retryLater() {
      clearTimeout(M.retryTimer);
      M.retryTimer = setTimeout(function () {
        if (M.state.saveState === 'offline') M.saveNow({ retry: true });
      }, 5000);
    };
    M.paintConflict = function paintConflict() {
      var c = M.els.conflict;
      c.textContent = '';
      c.hidden = !M.state.conflict;
      if (!M.state.conflict) return;
      c.appendChild(S.icon('alert-triangle'));
      c.appendChild(S.h('span', { text: 'Quelqu’un d’autre a enregistré une version plus récente de ce document.' }));
      c.appendChild(
        S.h('button', {
          class: 'dc-btn',
          onclick: function () {
            M.state.conflict = null;
            c.hidden = true;
            M.clearDraft(M.state.current.id);
            M.openDoc(M.state.current.id, { reload: true, skipSave: true });
          },
        }, [S.icon('refresh'), 'Charger sa version'])
      );
      c.appendChild(
        S.h('button', {
          class: 'dc-btn dc-btn--danger',
          onclick: function () {
            var remote = M.state.conflict;
            M.state.current.rev = remote.rev;
            M.state.conflict = null;
            c.hidden = true;
            M.setSave('dirty');
            M.saveNow({ force: true });
          },
        }, [S.icon('device-floppy'), 'Écraser avec la mienne'])
      );
    };
    M.refreshRemote = function refreshRemote(force) {
      if (!M.state.authOk || !M.state.docsLoaded || M.saving || (force !== true && Date.now() - M.lastRefreshAt < S.REFRESH_MIN_MS)) return Promise.resolve();
      M.lastRefreshAt = Date.now();
      return S.DT().listDocs(M.t).then(function (docs) {
        return S.DT().ensureFolderDocs(M.t, docs).then(function (r) { return r.docs; }, function () { return docs; });
      }).then(function (docs) {
        var keep = M.state.saveState !== 'saved' && M.state.current ? [M.state.current.id] : [];
        return S.DT().ensureProjectDocs
          ? S.DT().ensureProjectDocs(M.t, docs, { keepTitles: keep }).then(function (r) { return r.docs; }, function () { return docs; })
          : docs;
      }).then(function (docs) {
        var openId = M.state.current && M.state.current.id;
        M.state.docs = docs;
        M.state.idx = S.DT().getFolderIndex();
        M.paintList();
        M.rebuildIndex();
        if (!openId) return;
        if (!docs.some(function (d) { return d.id === openId; })) {
          M.toast('Ce document a été supprimé par quelqu’un d’autre.', 'error');
          return;
        }
        if (M.state.saveState !== 'saved' || !M.editor || S.DM().domToMd(M.editor) !== M.lastMd || M.coverTimer || M.repositioning) return;
        return S.DT().loadDoc(M.t, openId).then(function (doc) {
          if (!M.state.current || M.state.current.id !== openId || M.saving || S.DM().domToMd(M.editor) !== M.lastMd) return;
          if (doc.rev === M.state.current.rev) return;
          var top = M.els.scroll.scrollTop;
          M.state.current = doc;
          M.histBase(doc);
          M.savedTitle = doc.title;
          M.els.title.value = doc.title === S.DM().UNTITLED ? '' : doc.title;
          M.fitTitle();
          M.buildEditor(doc);
          M.els.scroll.scrollTop = top;
          M.toast('Document mis à jour par quelqu’un d’autre.', 'ok');
        }, function () {});
      }, function () {});
    };
    M.record = function record(e) { return M.HP ? M.HP.record(e) : e; };
    M.histBase = function histBase(doc) {
      clearTimeout(M.histTimer);
      M.editBase = { id: doc.id, body: doc.body || '' };
    };
    M.histBodySaved = function histBodySaved() {
      clearTimeout(M.histTimer);
      M.histTimer = setTimeout(M.histFlush, 45000);
    };
    M.histSummary = function histSummary(a, b) {
      var x = a.split('\n');
      var y = b.split('\n');
      var i = 0;
      while (i < x.length && i < y.length && x[i] === y[i]) i++;
      return { before: x[i] || '', after: y[i] || '' };
    };
    M.histFlush = function histFlush() {
      clearTimeout(M.histTimer);
      if (!M.editBase || !M.state.current || M.state.current.id !== M.editBase.id) return;
      var now = M.state.current.body || '';
      if (now === M.editBase.body) return;
      var s = M.histSummary(M.editBase.body, now);
      var keep = M.editBase.body.length <= M.HIST_MAX_BODY && now.length <= M.HIST_MAX_BODY;
      M.record({
        type: 'edit', key: 'body', label: 'Contenu', targetId: M.state.current.id,
        title: S.DM().cleanTitle(M.state.current.title) || S.DM().UNTITLED,
        before: s.before, after: s.after,
        beforeVal: keep ? M.editBase.body : null, afterVal: keep ? now : null,
      });
      M.editBase.body = now;
    };
    M.histRenamed = function histRenamed(id, oldTitle, newTitle) {
      if (oldTitle === newTitle) return;
      M.record({ type: 'edit', key: 'name', targetId: id, title: newTitle, before: oldTitle, after: newTitle, beforeVal: oldTitle, afterVal: newTitle });
    };
    M.histDeleted = function histDeleted(d, body) {
      M.record({ type: 'delete', targetId: d.id, title: d.title, beforeBody: body != null && body.length <= M.HIST_MAX_BODY ? body : null });
      if (M.editBase && M.editBase.id === d.id) M.editBase = null;
    };
    M.histAddLocal = function histAddLocal(doc) {
      M.state.docs.unshift({ id: doc.id, title: doc.title, updatedAt: doc.updatedAt });
      M.sortDocs();
      M.paintList();
      M.rebuildIndex();
    };
    M.histDropLocal = function histDropLocal(id) {
      var wasCurrent = M.state.current && M.state.current.id === id;
      M.state.docs = M.state.docs.filter(function (x) { return x.id !== id; });
      if (wasCurrent) {
        clearTimeout(M.saveTimer);
        M.state.current = null;
        M.editBase = null;
        S.remember(S.LAST_KEY, null);
        M.showCurrent();
        if (M.state.docs.length) M.openDoc(M.state.docs[0].id, { skipSave: true });
      }
      M.paintList();
      M.rebuildIndex();
    };
    M.histCanToggle = function histCanToggle(e) {
      if (e.type === 'delete') return e.beforeBody != null;
      if (e.type === 'edit' && e.key === 'body') return e.beforeVal != null && e.afterVal != null;
      return e.type === 'create' || e.type === 'edit';
    };
    M.histApply = function histApply(e, back) {
      var val = back ? e.beforeVal : e.afterVal;
      var id = e.targetId;
      var isCur = !!(M.state.current && M.state.current.id === id);
      if (e.type === 'create' || e.type === 'delete') {
        var remove = e.type === 'create' ? back : !back;
        if (remove) {
          var snap = e.type === 'create'
            ? (isCur ? Promise.resolve(M.lastDomMd()) : S.DT().loadDoc(M.t, id).then(function (d) { return d.body; }))
            : Promise.resolve(null);
          return snap.then(function (body) {
            if (e.type === 'create') e.afterBody = body.length <= M.HIST_MAX_BODY ? body : '';
            return S.DT().deleteDoc(M.t, id);
          }).then(function () { M.histDropLocal(id); });
        }
        return S.DT().createDoc(M.t, e.title, (e.type === 'create' ? e.afterBody : e.beforeBody) || '').then(function (doc) {
          e.targetId = doc.id;
          M.histAddLocal(doc);
        });
      }
      if (e.type === 'edit' && e.key === 'name') {
        return S.DT().renameDoc(M.t, id, val).then(function (r) {
          M.touchListItem(id, { title: r.title });
          if (M.state.current && M.state.current.id === id) {
            M.state.current.title = r.title;
            M.savedTitle = r.title;
            M.els.title.value = r.title === S.DM().UNTITLED ? '' : r.title;
            M.paintHead();
          }
          M.rebuildIndex();
        });
      }
      if (e.type === 'edit' && e.key === 'body') {
        var pre = isCur ? M.saveNow().then(function () { M.histFlush(); }) : Promise.resolve();
        return pre.then(function () { return S.DT().loadDoc(M.t, id); }).then(function (doc) {
          return S.DT().saveDoc(M.t, { id: id, body: val, rev: doc.rev, cover: doc.cover }, { force: true });
        }).then(function (res) {
          M.touchListItem(id, { updatedAt: res.updatedAt, size: String(val || '').length });
          if (isCur) return M.openDoc(id, { reload: true, skipSave: true });
        });
      }
      if (e.type === 'edit' && e.key === 'cover') {
        var pre2 = isCur ? M.saveNow() : Promise.resolve();
        return pre2.then(function () { return S.DT().loadDoc(M.t, id); }).then(function (doc) {
          return S.DT().setCover(M.t, doc, S.DM().parseCover(val));
        }).then(function (res) {
          M.touchListItem(id, { updatedAt: res.updatedAt });
          if (M.state.current && M.state.current.id === id) {
            M.state.current.rev = res.rev;
            M.state.current.cover = res.cover;
            M.state.current.savedCover = res.cover;
            M.paintCover();
          }
        });
      }
      return Promise.reject(new Error('Cette modification ne peut pas être annulée'));
    };
    M.histVerb = function histVerb(e) {
      if (e.type === 'create') return 'créé';
      if (e.type === 'delete') return 'supprimé';
      if (e.key === 'name') return 'renommé';
      if (e.key === 'cover') return 'couverture modifiée';
      return 'contenu modifié';
    };
    M.takeWantedSubject = function takeWantedSubject() {
      var sp;
      try { sp = new URLSearchParams(global.location.search); } catch (e) { return null; }
      var task = S.DM().cleanId(sp.get('docTask'));
      var entity = S.DM().cleanId(sp.get('docEntity'));
      var project = S.DM().normalizeSubject({ k: 'project', id: sp.get('docProject') });
      var person = S.DM().normalizeSubject({ k: 'person', id: sp.get('docPerson') });
      var name = String(sp.get('docName') || '').replace(/\s+/g, ' ').trim().slice(0, 120);
      var want = task ? { k: 'task', id: task }
        : entity ? { k: 'entity', id: entity }
        : project ? { k: 'project', id: project.id, name: name }
        : person ? { k: 'person', id: person.id, name: name }
        : null;
      if (!want) return null;
      try {
        var u = new URL(global.location.href);
        u.searchParams.delete('docTask');
        u.searchParams.delete('docEntity');
        u.searchParams.delete('docProject');
        u.searchParams.delete('docPerson');
        u.searchParams.delete('docName');
        global.history.replaceState(null, '', u.pathname + u.search + u.hash);
      } catch (e2) { /* the param simply stays in the address */ }
      return want;
    };
    M.loadDrive = function loadDrive() {
      var ST = global.SheetsTrello;
      if (!ST || !M.t || !ST.getSettings) return;
      var settings = null;
      ST.getSettings(M.t).then(function (s) {
        settings = s;
        if (!ST.isConnected(settings)) return null;
        return ST.info(settings);
      }).then(function (res) {
        if (!res || !res.ok) return null;
        var docs = res.data && res.data.documents;
        if (!docs || !docs.enabled || !docs.folderUrl) return null;
        M.state.driveUrl = docs.folderUrl;
        if (M.els.head && !M.els.driveBtn) {
          M.els.driveBtn = S.h('button', {
            class: 'dc-tb',
            type: 'button',
            title: 'Afficher dans Google Drive',
            'aria-label': 'Afficher dans Google Drive',
            onclick: function () { window.open(M.state.driveUrl, '_blank', 'noopener'); },
          }, [S.icon('brand-google-drive')]);
          var more = M.els.head.querySelector('[aria-label="Actions du document"]');
          if (more && more.parentNode) more.parentNode.insertBefore(M.els.driveBtn, more);
          else M.els.head.appendChild(M.els.driveBtn);
        }
        return ST.syncDocuments(settings);
      }).then(function (res) {
        if (!res || !res.ok || !res.data) return;
        var d = res.data;
        if ((d.pulled || 0) + (d.imported || 0) > 0) return M.refreshRemote(true);
      }).catch(function () { /* Drive is optional */ });
    };
    M.wireChipPins = function wireChipPins() {
      var Pins = global.DocsPins;
      if (!Pins || M.shell._chipPins) return;
      M.shell._chipPins = true;
      var REACH = 30;
      var HOT = 14;
      var layer = S.h('div', { class: 'dc-pin-layer' });
      var dots = {};
      Pins.ROLES.forEach(function (r) {
        var dot = S.h('button', {
          type: 'button',
          class: 'dc-pin dc-pin--' + r.id,
          title: r.label,
          'aria-label': r.label,
          'data-role': r.id,
        });
        dot.hidden = true;
        dots[r.id] = dot;
        dot.addEventListener('pointerdown', function (e) { startDrag(e, r.id); });
        layer.appendChild(dot);
      });
      var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'dc-pin-wire');
      var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      svg.appendChild(path);
      svg.hidden = true;
      layer.appendChild(svg);
      document.body.appendChild(layer);

      var hoverChip = null;
      var drag = null;
      var pick = null;

      function hideDots() {
        Pins.ROLES.forEach(function (r) {
          var dot = dots[r.id];
          dot.hidden = true;
          dot.classList.remove('is-near', 'is-hot');
        });
      }

      function placeDot(role, x, y, hot) {
        var dot = dots[role];
        dot.hidden = false;
        dot.style.left = x + 'px';
        dot.style.top = y + 'px';
        dot.classList.add('is-near');
        dot.classList.toggle('is-hot', !!hot);
      }

      function showNear(x, y) {
        hideDots();
        hoverChip = null;
        if (!M.editor) return;
        var best = null;
        Array.prototype.forEach.call(M.editor.querySelectorAll('.dc-mention--task'), function (chip) {
          var rect = chip.getBoundingClientRect();
          if (x < rect.left - 48 || x > rect.right + 48 || y < rect.top - 48 || y > rect.bottom + 48) return;
          var n = Pins.nearest(rect, x, y, REACH, HOT);
          if (n && (!best || n.d < best.d)) best = { chip: chip, rect: rect, d: n.d };
        });
        if (!best) return;
        hoverChip = best.chip;
        Pins.visible(best.rect, x, y, REACH, HOT).forEach(function (p) {
          placeDot(p.role, p.x, p.y, p.hot);
        });
      }

      function drawWire(x, y) {
        var x1 = drag.x;
        var y1 = drag.y;
        var c1x = x1 + drag.nx * 36;
        var c1y = y1 + drag.ny * 36;
        path.setAttribute('d', 'M' + x1.toFixed(1) + ',' + y1.toFixed(1) + ' C' + c1x.toFixed(1) + ',' + c1y.toFixed(1) + ' ' + x.toFixed(1) + ',' + y.toFixed(1) + ' ' + x.toFixed(1) + ',' + y.toFixed(1));
        path.setAttribute('stroke', drag.role === 'person' ? 'var(--dc-person)' : 'var(--dc-task)');
      }

      function onMove(e) {
        if (pick || !M.editor) return;
        if (drag) { drawWire(e.clientX, e.clientY); return; }
        showNear(e.clientX, e.clientY);
      }

      function startDrag(e, roleId) {
        if (e.button !== 0 || !hoverChip) return;
        e.preventDefault();
        e.stopPropagation();
        clearTimeout(M.previewTimer);
        if (!M.previewPinned) M.closePop();
        var role = Pins.roleById(roleId);
        var dot = dots[roleId];
        drag = {
          role: roleId,
          chip: hoverChip,
          fromId: hoverChip.getAttribute('data-id'),
          x: parseFloat(dot.style.left),
          y: parseFloat(dot.style.top),
          nx: role.nx,
          ny: role.ny,
          sx: e.clientX,
          sy: e.clientY,
        };
        svg.hidden = false;
        layer.classList.add('is-wiring');
        try { dot.setPointerCapture(e.pointerId); } catch (err) {}
        drawWire(e.clientX, e.clientY);
      }

      function endDrag(e) {
        if (!drag) return;
        var d = drag;
        var moved = Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy);
        drag = null;
        svg.hidden = true;
        layer.classList.remove('is-wiring');
        hideDots();
        if (moved < 8) return;
        var hit = dropTarget(d, e.clientX, e.clientY);
        if (hit) commit(d, hit);
        else openPick(d, e.clientX, e.clientY);
      }

      function dropTarget(d, x, y) {
        var stack = document.elementsFromPoint ? document.elementsFromPoint(x, y) : [document.elementFromPoint(x, y)];
        var i;
        for (i = 0; i < stack.length; i++) {
          var el = stack[i];
          if (!el || !el.closest || !M.editor.contains(el)) continue;
          if (d.role === 'person') {
            var person = el.closest('.dc-mention[data-m="person"]');
            if (person) return { id: person.getAttribute('data-id') };
          } else {
            var task = el.closest('.dc-mention--task');
            if (task && task !== d.chip) return { id: task.getAttribute('data-id') };
          }
        }
        return null;
      }

      function commit(d, hit) {
        if (d.role === 'person') linkPerson(d.fromId, hit.id);
        else linkTasks(d.role, d.fromId, hit.id);
      }

      function linkTasks(role, fromId, toId) {
        var spec = Pins.taskWrite(role, fromId, toId);
        var PT = global.PriorityTrello;
        if (!spec || !PT || typeof PT.getCardInputsById !== 'function' || typeof PT.saveCardInputsById !== 'function') {
          M.toast('Lien impossible.', 'error');
          return;
        }
        PT.getCardInputsById(M.t, spec.cardId).then(function (inputs) {
          var next = Pins.appendDep(inputs && inputs.dependsOn, inputs && inputs.depTypes, spec.addId, spec.depType, spec.cardId);
          if (!next) return;
          if (!next.changed) { M.toast('Déjà lié.', 'ok'); return; }
          return PT.saveCardInputsById(M.t, spec.cardId, { dependsOn: next.dependsOn, depTypes: next.depTypes }).then(function () {
            M.toast(role === 'parent' ? 'Tâche parente liée.' : 'Tâche voisine liée.', 'ok');
          });
        }).catch(function (err) { M.failure(err); });
      }

      function linkPerson(cardId, personId) {
        var item = M.state.index && S.DM().resolveMention(M.state.index, 'person', personId);
        if (item && item.contact) { M.toast('Membre du tableau seulement.', 'error'); return; }
        var api = S.DT();
        if (!api || typeof api.loadCardFace !== 'function' || typeof api.setCardMembers !== 'function') {
          M.toast('Lien impossible.', 'error');
          return;
        }
        api.loadCardFace(M.t, cardId).then(function (face) {
          var next = Pins.appendMember((face.members || []).map(function (m) { return m.id; }), personId);
          if (!next) return;
          if (!next.changed) { M.toast('Déjà responsable.', 'ok'); return; }
          return api.setCardMembers(M.t, cardId, next.ids).then(function () {
            M.toast('Responsable ajouté.', 'ok');
          });
        }).catch(function (err) { M.failure(err); });
      }

      function closePick() {
        document.removeEventListener('mousedown', onPickOut, true);
        if (pick && pick.parentNode) pick.parentNode.removeChild(pick);
        pick = null;
      }

      function onPickOut(e) {
        if (pick && !pick.contains(e.target)) closePick();
      }

      function openPick(d, x, y) {
        closePick();
        var role = Pins.roleById(d.role);
        var box = S.h('div', { class: 'dc-suggest dc-pin-pick' });
        var input = S.h('input', { class: 'dc-input', type: 'text', placeholder: role.label + '…', 'aria-label': role.label });
        var list = S.h('div');
        box.appendChild(input);
        box.appendChild(list);
        var matches = [];
        var active = 0;
        function pool() {
          var idx = M.state.index;
          if (!idx) return [];
          var src = role.kind === 'person' ? (idx.person || []) : (idx.task || []);
          return src.filter(function (it) {
            if (role.kind === 'person' && it.contact) return false;
            if (role.kind === 'task' && it.id === d.fromId) return false;
            return true;
          });
        }
        function paint() {
          var q = input.value.trim().toLowerCase();
          matches = pool().filter(function (it) {
            return !q || String(it.label || '').toLowerCase().indexOf(q) >= 0;
          }).slice(0, 8);
          if (active >= matches.length) active = 0;
          list.textContent = '';
          matches.forEach(function (it, i) {
            var row = S.h('div', { class: 'dc-sg-row' + (i === active ? ' is-active' : ''), role: 'option' });
            row.appendChild(S.h('span', { class: 'dc-sg-label', text: it.label }));
            row.addEventListener('mousedown', function (ev) {
              ev.preventDefault();
              choose(it);
            });
            list.appendChild(row);
          });
        }
        function choose(it) {
          var from = d.fromId;
          var roleId = d.role;
          closePick();
          if (roleId === 'person') linkPerson(from, it.id);
          else linkTasks(roleId, from, it.id);
        }
        input.addEventListener('input', paint);
        input.addEventListener('keydown', function (ev) {
          ev.stopPropagation();
          if (ev.key === 'Escape') { ev.preventDefault(); closePick(); }
          else if ((ev.key === 'ArrowDown' || ev.key === 'ArrowUp') && matches.length) {
            ev.preventDefault();
            active = ev.key === 'ArrowDown' ? (active + 1) % matches.length : (active - 1 + matches.length) % matches.length;
            paint();
          } else if (ev.key === 'Enter' && matches[active]) {
            ev.preventDefault();
            choose(matches[active]);
          }
        });
        document.body.appendChild(box);
        box.style.left = Math.max(8, Math.min(x, global.innerWidth - 268)) + 'px';
        box.style.top = Math.max(8, Math.min(y + 8, global.innerHeight - 220)) + 'px';
        pick = box;
        paint();
        input.focus();
        setTimeout(function () { document.addEventListener('mousedown', onPickOut, true); }, 0);
      }

      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', endDrag);
      document.addEventListener('pointercancel', function () {
        drag = null;
        svg.hidden = true;
        layer.classList.remove('is-wiring');
        hideDots();
      });
      document.addEventListener('scroll', function () { if (!drag) hideDots(); }, true);
    };
    M.boot = function boot() {
      S.DT().isAuthorized(M.t).then(function (ok) {
        M.state.authOk = ok;
        M.paintBanner();
        if (!ok) {
          M.state.docsLoaded = true;
          M.paintList();
          M.showCurrent();
          return;
        }
        M.loadSources().catch(function () {});
        return S.DT().listDocs(M.t).then(function (docs) {
          return S.DT().ensureDefaultDoc(M.t, docs).then(
            function (r) { return r.docs; },
            function (err) { M.failure(err); return docs; } // creation failed: show the empty state
          );
        }).then(function (docs) {
          return S.DT().ensureFolderDocs(M.t, docs).then(function (r) { return r.docs; }, function () { return docs; });
        }).then(function (docs) {
          return S.DT().ensureProjectDocs
            ? S.DT().ensureProjectDocs(M.t, docs).then(function (r) { return r.docs; }, function () { return docs; })
            : docs;
        }).then(function (docs) {
          if (!S.DT().refreshDaily || S.DM().docForSubject(docs, 'day', 'today')) return docs;
          return S.DT().refreshDaily(M.t).then(function (r) { return r.docs; }, function () { return docs; });
        }).then(
          function (docs) {
            M.state.docs = docs;
            M.state.idx = S.DT().getFolderIndex();
            M.state.docsLoaded = true;
            M.paintList();
            M.rebuildIndex();
            M.loadDrive();
            var want = M.takeWantedSubject();
            if (want) {
              var existing = S.DM().docForSubject(docs, want.k, want.id);
              if (existing) return M.openDoc(existing.id, { skipSave: true });
              return S.DT().ensureSubjectDoc(M.t, want.k, want.id, want.name).then(function (r) {
                M.state.docs = r.docs;
                M.state.idx = S.DT().getFolderIndex();
                M.paintList();
                return M.openDoc(r.doc.id, { skipSave: true });
              }, function (err) {
                M.failure(err);
              });
            }
            var last = S.recall(S.LAST_KEY);
            var drafted = docs.map(function (d) { return { d: d, dr: M.readDraft(d.id) }; })
              .filter(function (x) { return x.dr; })
              .sort(function (a, b) { return b.dr.at - a.dr.at; })[0];
            var pick = (drafted && drafted.d)
              || docs.filter(function (d) { return d.id === last; })[0]
              || docs.filter(function (d) { return !(d.subject && d.subject.k === 'day'); })[0]
              || docs[0];
            if (pick) return M.openDoc(pick.id, { skipSave: true });
            M.showCurrent();
          },
          function (err) {
            M.state.docsLoaded = true;
            M.paintList();
            M.showCurrent();
            M.failure(err);
          }
        );
      }).then(M.endBoot, M.endBoot);
    };
    M.endBoot = function endBoot() {
      M.shell.classList.remove('is-booting');
    };
    },
    run: function (M) {
    M.daySyncTimer = null;
    M.HP = null;
    M.HIST_MAX_BODY = 6000;
    M.editBase = null;
    M.histTimer = null;
    M.histBoard = '';
    try { M.histBoard = (M.t && typeof M.t.getContext === 'function' && M.t.getContext().board) || ''; } catch (e) { /* no context */ }
    M.HP = global.HistoryPanel.create({
      key: 'tp-docs-history:' + M.histBoard,
      apply: M.histApply,
      canToggle: M.histCanToggle,
      verb: M.histVerb,
      onStatus: function (m, kind, openHistory) {
        M.toast(m, kind === 'ok' ? 'ok' : '', kind === 'ok' && openHistory ? { onMessage: openHistory } : null);
      },
      onError: M.failure,
    });
    M.els.title.addEventListener('input', function () {
      if (!M.state.current) return;
      var flat = M.els.title.value.replace(/[\r\n]+/g, ' ');
      if (flat !== M.els.title.value) {
        var at = M.els.title.selectionStart;
        M.els.title.value = flat;
        try { M.els.title.setSelectionRange(at, at); } catch (e) { /* ignore */ }
      }
      M.state.current.title = M.els.title.value;
      M.paintHead();
      M.touchListItem(M.state.current.id, { title: M.els.title.value || S.DM().UNTITLED });
      if (M.state.saveState !== 'conflict') M.setSave('dirty');
      M.scheduleSave(S.SAVE_DELAY_MS);
    });
    M.els.title.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === 'ArrowDown') {
        e.preventDefault();
        if (M.editor) {
          M.editor.focus();
          var r = document.createRange();
          r.selectNodeContents(M.editor);
          r.collapse(true);
          var s = global.getSelection();
          s.removeAllRanges();
          s.addRange(r);
        }
      }
    });
    M.els.title.addEventListener('blur', function () {
      if (M.state.saveState === 'dirty') M.saveNow();
    });
    M.selPaint = 0;
    document.addEventListener('selectionchange', function () {
      if (!M.editor) return;
      M.saveSel();
      if (M.selPaint) return;
      M.selPaint = requestAnimationFrame(function () {
        M.selPaint = 0;
        if (!M.editor) return;
        M.paintToolbarState();
        var sel = global.getSelection();
        if (M.editor === document.activeElement || (M.sugg && sel && M.editor.contains(sel.anchorNode))) M.updateSuggest();
        M.updateSelBar();
      });
    });
    document.addEventListener('mousedown', function (e) {
      var inSel = e.target.closest && e.target.closest('.dc-selbar');
      if (M.pop && !M.pop.contains(e.target) && !inSel && !(e.target.closest && e.target.closest('.cf-pop, .tp-context-menu'))) M.closePop();
      if (M.sugg && !M.els.suggest.contains(e.target) && !(M.editor && M.editor.contains(e.target))) M.closeSuggest();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        M.closePop();
        if (!M.editorSelection()) M.hideSelBar();
      }
    });
    global.addEventListener('resize', function () {
      if (M.sugg) M.placeSuggest();
      if (M.selBar) M.placeSelBar();
      if (M.blockHover) M.showBlockUi(M.blockHover);
      M.fitTitle();
    });
    if (global.ResizeObserver) {
      M.titleWidth = 0;
      new ResizeObserver(function () {
        var w = M.els.page.clientWidth;
        if (w === M.titleWidth) return;
        M.titleWidth = w;
        M.fitTitle();
      }).observe(M.els.page);
    }
    M.els.scroll.addEventListener('scroll', function () {
      if (M.sugg) M.placeSuggest(); // the caret moved on screen, the popup follows (layout shifts also scroll)
      M.closePop();
      if (M.selBar) M.placeSelBar();
    });
    global.addEventListener('focus', M.refreshRemote);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') M.saveNow();
      else M.refreshRemote();
    });
    if (global.Connection) {
      global.Connection.onChange(function (off) {
        if (off) { if (M.state.saveState === 'dirty') M.setSave('offline'); return; }
        if (M.state.saveState === 'offline') M.saveNow({ retry: true });
      });
    }
    global.addEventListener('pagehide', function () {
      M.keepDraft();
      M.histFlush();
      M.flushCover();
      M.saveNow();
    });
    M.buildSide();
    M.buildToolbar();
    M.wireBlockUi();
    M.paintList();
    M.showCurrent();
    M.boot();
    if (global.AssistantDock) {
      global.AssistantDock.mount({
        t: M.t,
        after: M.root,
        onRefresh: function () { M.refreshRemote(true); },
        isBusy: function () {
          var ae = document.activeElement;
          var typing = ae && M.root.contains(ae) && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable);
          return !!typing || M.saving || (global.CardFields && global.CardFields.isOpen());
        },
      });
    }
    return { v: {
      state: M.state,
      openDoc: M.openDoc,
      newDoc: M.newDoc,
      saveNow: M.saveNow,
      getEditor: function () { return M.editor; },
      refresh: function () { return M.refreshRemote(true); },
      reload: M.boot,
    } };
    }
  });
})(typeof window !== 'undefined' ? window : this);
