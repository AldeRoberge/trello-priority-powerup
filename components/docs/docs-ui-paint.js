/**
 * docs-ui: mount() part 2 of 6.
 * The body of mount runs in order across these parts; its locals live on the per-call state object (M).
 * Order and shared names: see docs-ui.parts.json and docs/architecture.md.
 */
(function (global) {
  'use strict';

  var S = (global.DocsUiParts = global.DocsUiParts || {});
  var P = (global.DocsUiPartsMountMount = global.DocsUiPartsMountMount || { list: [] });

  P.list.push({
    define: function (M) {
    M.paintToolbarState = function paintToolbarState() {
      if (!M.editor) return;
      var n = M.selNode();
      var inEditor = !!n;
      function on(cmd, v) {
        var b = M.els.toolbar.querySelector('[data-cmd="' + cmd + '"]');
        if (b) {
          b.classList.toggle('is-on', !!v);
          b.setAttribute('aria-pressed', v ? 'true' : 'false');
        }
      }
      var q = function (c) {
        try { return inEditor && document.queryCommandState(c); } catch (e) { return false; }
      };
      on('bold', q('bold'));
      on('italic', q('italic'));
      on('underline', q('underline'));
      on('strike', q('strikeThrough'));
      on('code', inEditor && !!M.closestIn(n, 'CODE'));
      on('link', inEditor && !!M.closestIn(n, 'A'));
      var li = inEditor && M.closestIn(n, 'LI');
      var list = li && li.parentNode;
      on('ul', !!list && list.tagName === 'UL' && !list.classList.contains('dc-todo'));
      on('ol', !!list && list.tagName === 'OL');
      on('todo', !!list && list.tagName === 'UL' && list.classList.contains('dc-todo'));
      on('quote', inEditor && !!M.closestIn(n, 'BLOCKQUOTE'));
      on('codeblock', inEditor && !!M.closestIn(n, 'PRE'));
      on('highlight', inEditor && !!M.closestIn(n, 'MARK'));
      on('callout', inEditor && !!M.closestIn(n, 'BLOCKQUOTE[data-callout]'));
      var aligned = inEditor && M.closestIn(n, 'P,H1,H2,H3,BLOCKQUOTE,TD,TH');
      var align = aligned && aligned.getAttribute('data-align');
      on('align', align === 'center' || align === 'right');
      var sel = M.els.toolbar.querySelector('.dc-select');
      if (sel && inEditor) sel.value = M.blockType() === 'codeblock' ? 'p' : M.blockType();
      M.paintSelBarState();
    };
    M.onEdit = function onEdit(kind) {
      if (kind !== 'text') {
        M.fixTables();
        M.fixImages();
        M.fixChips();
      }
      M.normalizeRoot();
      M.paintEmptyClass();
      if (M.state.saveState !== 'conflict') M.setSave('dirty');
      M.scheduleSave(S.SAVE_DELAY_MS);
      clearTimeout(M.metaTimer);
      M.metaTimer = setTimeout(function () {
        M.paintMeta();
        M.paintOutline();
      }, 350);
    };
    M.paintMeta = function paintMeta() {
      M.els.meta.textContent = '';
      if (!M.state.current || !M.editor) return;
      var cur = M.state.current;
      var words = S.DM().countWords(M.editor.textContent || '');
      var who = M.docWho(cur);
      var line = [];
      if (who && who.author) line.push('Créé par ' + M.whoName(who.author.member));
      if (cur.updatedAt) {
        var by = who && who.editor ? (Date.parse(cur.updatedAt) - Date.parse(who.editor.date) > 5000 ? M.whoMe : who.editor.member) : null;
        var mod = 'modifié ' + S.DM().relativeTime(cur.updatedAt) + (by ? ' par ' + M.whoName(by) : '');
        line.push(S.DH() ? S.h('button', { class: 'dc-meta-link', type: 'button', title: 'Historique des versions', onclick: M.openVersions }, [mod]) : mod);
      }
      line.push(words + (words > 1 ? ' mots' : ' mot'));
      var span = S.h('span');
      line.forEach(function (x, i) {
        if (i) span.appendChild(document.createTextNode(' · '));
        span.appendChild(typeof x === 'string' ? document.createTextNode(x) : x);
      });
      M.els.meta.appendChild(span);
      var size = S.DM().sizeInfo(M.lastDomMd());
      if (size.ratio >= 0.8) {
        var over = size.over;
        M.els.meta.appendChild(
          S.h('span', {
            class: 'dc-size' + (over ? ' is-over' : ''),
            title: 'Un document est stocké dans la description d’une carte Trello (16 384 caractères au maximum).',
            text: size.length.toLocaleString('fr-FR') + ' / ' + size.max.toLocaleString('fr-FR') + ' car.',
          })
        );
      }
      M.paintBacklinks();
    };
    M.docsForLinks = function docsForLinks() {
      return (M.state.docs || []).map(function (d) {
        if (M.state.current && d.id === M.state.current.id && M.editor) return Object.assign({}, d, { body: M.lastDomMd() });
        return d;
      });
    };
    M.paintBacklinks = function paintBacklinks() {
      if (!M.els.links) return;
      M.els.links.textContent = '';
      if (!M.state.current || !global.WorkOS || typeof global.WorkOS.backlinks !== 'function') return;
      var links = global.WorkOS.backlinks(M.docsForLinks(), 'doc', M.state.current.id);
      if (!links.length) { M.els.links.hidden = true; return; }
      M.els.links.hidden = false;
      M.els.links.appendChild(S.h('span', { class: 'dc-backlinks-k', text: 'Mentionné dans' }));
      links.forEach(function (d) {
        M.els.links.appendChild(S.h('button', {
          class: 'dc-mention-link',
          type: 'button',
          text: d.title,
          onclick: function () { M.openDoc(d.id); },
        }));
      });
    };
    M.docWho = function docWho(doc) {
      if (!S.DH()) return null;
      if (doc.who !== undefined) return doc.who;
      doc.who = null;
      Promise.all([S.DH().loadWho(M.t, doc.id), S.DH().loadMe(M.t)]).then(function (r) {
        doc.who = r[0];
        M.whoMe = r[1];
        if (M.state.current === doc) M.paintMeta();
      }, function () {});
      return null;
    };
    M.whoName = function whoName(m) {
      return M.whoMe && m && m.id === M.whoMe.id ? 'vous' : (m && m.name) || 'quelqu’un';
    };
    M.openVersions = function openVersions() {
      var cur = M.state.current;
      if (!cur || !S.DH()) return;
      M.closePop();
      M.saveNow().then(function () {
        if (M.state.current !== cur) return;
        M.histFlush();
        S.DH().loadMe(M.t).then(function (me) {
          S.DH().openPanel({ root: M.shell, t: M.t, docId: cur.id, title: cur.title, currentBody: cur.body || '', me: me, onRestore: M.restoreVersion });
        });
      });
    };
    M.restoreVersion = function restoreVersion(body) {
      var cur = M.state.current;
      if (!cur) return Promise.resolve(false);
      var was = cur.body || '';
      if (body === was) return Promise.resolve(true);
      return S.DT().saveDoc(M.t, { id: cur.id, body: body, rev: cur.rev, cover: cur.cover || null }).then(function (res) {
        var s = M.histSummary(was, body);
        var keep = was.length <= M.HIST_MAX_BODY && body.length <= M.HIST_MAX_BODY;
        M.record({
          type: 'edit', key: 'body', label: 'Contenu', targetId: cur.id,
          title: S.DM().cleanTitle(cur.title) || S.DM().UNTITLED,
          before: s.before, after: s.after,
          beforeVal: keep ? was : null, afterVal: keep ? body : null,
        });
        M.touchListItem(cur.id, { updatedAt: res.updatedAt, size: body.length });
        return M.openDoc(cur.id, { reload: true, skipSave: true }).then(function () {
          M.toast('Version restaurée.', 'ok');
          return true;
        });
      }, function (err) {
        M.failure(err);
        return false;
      });
    };
    M.dueLabel = function dueLabel(iso) {
      var ms = Date.parse(iso);
      if (!isFinite(ms)) return '';
      var d = new Date(ms);
      return d.getDate() + ' ' + M.DUE_MONTHS[d.getMonth()];
    };
    M.pageProps = function pageProps() {
      var p = M.state.current && M.state.current.props;
      return { tags: p && p.tags ? p.tags.slice() : [], people: p && p.people ? p.people.slice() : [] };
    };
    M.customAssignees = function customAssignees() {
      var inputs = M.state.taskFields && M.state.taskFields.inputs;
      return ((inputs && inputs.customAssignees) || []).map(function (c) {
        return c && c.id && c.name ? { id: String(c.id), name: c.name } : null;
      }).filter(Boolean);
    };
    M.memberName = function memberName(id) {
      var key = String(id);
      var src = (M.state.sources && M.state.sources.members) || [];
      var m = src.filter(function (x) { return String(x.id) === key; })[0];
      if (m) return m.fullName || m.name || m.username || key;
      var fm = M.state.face && (M.state.face.members || []).filter(function (x) { return String(x.id) === key; })[0];
      if (fm && fm.name) return fm.name;
      var contact = ((M.state.sources && M.state.sources.contacts) || []).filter(function (x) { return x && String(x.id) === key; })[0];
      if (contact && contact.name) return contact.name;
      var custom = M.customAssignees().filter(function (x) { return x.id === key; })[0];
      if (custom) return custom.name;
      var item = M.state.index && S.DM().resolveMention(M.state.index, 'person', key);
      return (item && item.label) || key;
    };
    M.isTaskPage = function isTaskPage() {
      return !!(M.state.current && M.state.current.subject && M.state.current.subject.k === 'task' && M.state.face && !M.state.face.missing);
    };
    M.propRow = function propRow(iconName, label, fill, extra) {
      var value = S.h('div', { class: 'dc-prop-value' });
      fill(value);
      return S.h('div', { class: 'dc-prop' }, [
        S.h('div', { class: 'dc-prop-label' }, [S.icon(iconName), S.h('span', { text: label }), extra || null]),
        value,
      ]);
    };
    M.emptyBtn = function emptyBtn(text, run) {
      return S.h('button', { class: 'dc-prop-empty', type: 'button', onclick: run }, [text]);
    };
    M.plusBtn = function plusBtn(label, run) {
      return S.h('button', {
        class: 'dc-prop-add', type: 'button', title: label, 'aria-label': label,
        onclick: function (e) { e.stopPropagation(); run(e.currentTarget); },
      }, [S.icon('plus')]);
    };
    M.endList = function endList(value, key, add) {
      var bits = S.h('div', { class: 'dc-prop-bits' });
      while (value.firstChild) bits.appendChild(value.firstChild);
      if (add) bits.appendChild(add);
      value.appendChild(bits);
      value.setAttribute('data-clip', key);
    };
    M.textOverflows = function textOverflows(root) {
      var nodes = root.querySelectorAll('.dc-subdoc span, .dc-chip-main, .dc-prop-text, .dc-chip.is-quiet');
      var i;
      for (i = 0; i < nodes.length; i++) {
        if (nodes[i].scrollWidth > nodes[i].clientWidth + 1) return true;
      }
      return false;
    };
    M.settleClips = function settleClips() {
      var open = M.state.propOpen;
      Array.prototype.forEach.call(M.els.props.querySelectorAll('.dc-prop-value[data-clip]'), function (value) {
        if (!value.isConnected) return;
        var key = value.getAttribute('data-clip');
        var bits = value.querySelector('.dc-prop-bits');
        if (!bits) return;
        var prev = bits.querySelector('.dc-prop-more');
        if (prev) prev.remove();
        value.classList.remove('is-open');
        var add = bits.querySelector('.dc-prop-add');
        var kids = Array.prototype.filter.call(bits.children, function (el) { return el !== add; });
        kids.forEach(function (el) { el.classList.remove('is-clip-hide'); });
        if (open[key]) {
          value.classList.add('is-open');
          return;
        }
        var tooWide = M.textOverflows(bits);
        var top = bits.getBoundingClientRect().top;
        var overflow = kids.filter(function (el) { return el.getBoundingClientRect().top > top + 86; });
        if (!overflow.length && !tooWide) return;
        overflow.forEach(function (el) { el.classList.add('is-clip-hide'); });
        var more = S.h('button', {
          class: 'dc-prop-more', type: 'button', title: 'Afficher la suite', 'aria-label': 'Afficher la suite',
          onclick: function (e) {
            e.stopPropagation();
            open[key] = true;
            kids.forEach(function (el) { el.classList.remove('is-clip-hide'); });
            value.classList.add('is-open');
            more.remove();
          },
        }, ['…']);
        if (add) bits.insertBefore(more, add);
        else bits.appendChild(more);
        var guard = 0;
        while (guard < 8 && more.getBoundingClientRect().top > top + 90) {
          var visible = kids.filter(function (el) { return !el.classList.contains('is-clip-hide'); });
          if (!visible.length) break;
          visible[visible.length - 1].classList.add('is-clip-hide');
          guard += 1;
        }
      });
    };
    M.scheduleClips = function scheduleClips() {
      if (M.scheduleClips.frame) return;
      M.scheduleClips.frame = requestAnimationFrame(function () {
        M.scheduleClips.frame = 0;
        M.settleClips();
      });
    };
    M.chip = function chip(label, opts) {
      opts = opts || {};
      var box = S.h('span', { class: 'dc-chip' + (opts.dim ? ' is-dim' : '') });
      if (opts.color && M.LABEL_BG[opts.color]) {
        box.style.background = M.LABEL_BG[opts.color];
        box.style.color = '#fff';
      }
      box.appendChild(S.h('button', { class: 'dc-chip-main', type: 'button', title: opts.title || label, onclick: opts.onClick || null }, [label]));
      if (opts.onRemove) {
        box.appendChild(S.h('button', {
          class: 'dc-chip-x', type: 'button', 'aria-label': 'Retirer',
          onclick: function (e) { e.stopPropagation(); opts.onRemove(); },
        }, ['×']));
      }
      return box;
    };
    M.openPicker = function openPicker(anchor, rows, tail) {
      M.closePop();
      var box = S.h('div', { class: 'dc-pop dc-picker' });
      var search = S.h('input', { class: 'dc-picker-search', type: 'search', placeholder: 'Rechercher…', 'aria-label': 'Rechercher' });
      var list = S.h('div', { class: 'dc-picker-list' });
      function paint(q) {
        list.textContent = '';
        var query = S.DM().fold(q || '');
        var shown = 0;
        rows.forEach(function (r) {
          if (query && S.DM().fold(r.label).indexOf(query) < 0) return;
          if (shown >= 40) return;
          shown += 1;
          list.appendChild(S.h('button', {
            class: 'dc-menu-item' + (r.on ? ' is-on' : ''),
            type: 'button',
            onclick: function () { r.run(); },
          }, [S.icon(r.on ? 'check' : (r.icon || 'point')), S.h('span', { text: r.label })]));
        });
        if (typeof tail === 'function') tail(list, q || '', shown);
        if (!list.childNodes.length) list.appendChild(S.h('div', { class: 'dc-pop-sub', text: 'Aucun résultat' }));
      }
      search.addEventListener('input', function () { paint(search.value); });
      box.appendChild(search);
      box.appendChild(list);
      M.pop = box;
      M.placePop(M.pop, anchor.getBoundingClientRect());
      paint('');
      search.focus();
    };
    M.patchPage = function patchPage(patch) {
      var cur = M.state.current;
      if (!cur || cur.kind === 'task') return Promise.resolve();
      return S.DT().patchMeta(M.t, { id: cur.id, rev: cur.rev }, patch).then(function (res) {
        cur.rev = res.rev;
        cur.updatedAt = res.updatedAt;
        if (patch.subject !== undefined) cur.subject = res.subject;
        if (patch.props !== undefined) cur.props = res.props;
        M.touchListItem(cur.id, { subject: cur.subject, props: cur.props, updatedAt: res.updatedAt });
        return res;
      }, M.failure);
    };
    M.bindSubject = function bindSubject(kind, id, title) {
      var cur = M.state.current;
      if (!cur) return;
      var other = S.DM().docForSubject(M.state.docs, kind, id);
      if (other && other.id !== cur.id) {
        M.toast(kind === 'entity' ? 'Cette entité a déjà une page.' : 'Cette tâche a déjà une page.');
        M.openDoc(other.id);
        return;
      }
      M.patchPage({ subject: { k: kind, id: id } }).then(function (res) {
        if (!res) return;
        if ((!M.els.title.value.trim() || cur.title === S.DM().UNTITLED) && title) {
          M.els.title.value = S.DM().cleanTitle(title);
          M.fitTitle();
          M.scheduleSave(10);
        }
        M.loadFace();
      });
    };
    M.openLinkPicker = function openLinkPicker(anchor) {
      var cards = ((M.state.sources && M.state.sources.cards) || []).filter(function (c) {
        return c && c.id && !S.DM().isDocName(c.name) && String(c.name || '').indexOf('🧩') !== 0;
      });
      function rowsFor(ents) {
        var rows = cards.map(function (c) {
          return { label: c.name || 'Sans titre', icon: 'checkbox', run: function () { M.closePop(); M.bindSubject('task', c.id, c.name); } };
        });
        (ents || []).forEach(function (ent) {
          rows.push({ label: ent.name, icon: 'stack-2', run: function () { M.closePop(); M.bindSubject('entity', ent.id, ent.name); } });
        });
        return rows;
      }
      S.DT().listEntityChoices(M.t).then(
        function (ents) { M.openPicker(anchor, rowsFor(ents)); },
        function () { M.openPicker(anchor, rowsFor([])); }
      );
    };
    M.isBoardMember = function isBoardMember(id) {
      var key = String(id);
      return ((M.state.sources && M.state.sources.members) || []).some(function (m) { return String(m.id) === key; });
    };
    M.assignedIds = function assignedIds() {
      if (M.isTaskPage()) {
        return (M.state.face.members || []).map(function (m) { return String(m.id); })
          .concat(M.customAssignees().map(function (c) { return c.id; }));
      }
      return M.pageProps().people.map(String);
    };
    M.writeCustom = function writeCustom(id, name, onlyAdd) {
      var cardId = M.state.current && M.state.current.subject && M.state.current.subject.id;
      var PT = global.PriorityTrello;
      if (!cardId || !PT || typeof PT.getCardInputsById !== 'function' || typeof PT.saveCardInputsById !== 'function') {
        M.failure(new Error('Enregistrement indisponible'));
        return Promise.resolve();
      }
      return PT.getCardInputsById(M.t, cardId).then(function (inputs) {
        var list = ((inputs && inputs.customAssignees) || []).map(function (c) {
          return { id: String(c.id), name: c.name };
        });
        var at = -1;
        for (var i = 0; i < list.length; i++) if (list[i].id === String(id)) at = i;
        if (at >= 0) {
          if (onlyAdd) return;
          list.splice(at, 1);
        } else {
          var entry = { id: String(id), name: name || M.memberName(id) };
          var PU = global.PriorityUI;
          if (PU && typeof PU.normalizeCustomAssigneeEntry === 'function') entry = PU.normalizeCustomAssigneeEntry(entry) || entry;
          list.push(entry);
        }
        return PT.saveCardInputsById(M.t, cardId, { customAssignees: list }).then(function () { M.loadFace(); });
      }, M.failure);
    };
    M.togglePerson = function togglePerson(id, name) {
      if (M.isTaskPage() && !M.isBoardMember(id)) {
        M.writeCustom(id, name || M.memberName(id), false);
        return;
      }
      if (M.isTaskPage()) {
        var ids = (M.state.face.members || []).map(function (m) { return m.id; });
        var at = ids.indexOf(id);
        if (at >= 0) ids.splice(at, 1);
        else ids.push(id);
        S.DT().setCardMembers(M.t, M.state.current.subject.id, ids).then(function () { M.loadFace(); }, M.failure);
        return;
      }
      var props = M.pageProps();
      var j = props.people.indexOf(id);
      if (j >= 0) props.people.splice(j, 1);
      else props.people.push(id);
      M.patchPage({ props: props }).then(function () { M.paintProps(); });
    };
    M.publishAssignee = function publishAssignee(person) {
      var PT = global.PriorityTrello;
      var People = global.People;
      if (!person || !PT || !People || typeof PT.getCustomAssigneeCatalog !== 'function' || typeof PT.saveCustomAssigneeCatalog !== 'function' || typeof People.mergeIntoAssigneeCatalog !== 'function') {
        return Promise.resolve();
      }
      return PT.getCustomAssigneeCatalog(M.t).then(function (catalog) {
        var merged = People.mergeIntoAssigneeCatalog(catalog || [], { people: [person] });
        if (!merged.changed) return;
        return PT.saveCustomAssigneeCatalog(M.t, merged.catalog);
      }).catch(function () {});
    };
    M.savePerson = function savePerson(name) {
      var People = global.People;
      if (!People || typeof People.load !== 'function' || typeof People.upsert !== 'function' || typeof People.save !== 'function' || typeof People.findByAliasOrName !== 'function') {
        return Promise.reject(new Error('Enregistrement indisponible'));
      }
      return People.load(M.t).then(function (dir) {
        var before = People.findByAliasOrName(dir, name);
        var next = People.upsert(dir || { people: [] }, { name: name });
        var person = People.findByAliasOrName(next, name);
        if (!person || !person.id) throw new Error('Nom invalide');
        var stored = before ? Promise.resolve(next) : People.save(M.t, next);
        return stored.then(function (saved) {
          var list = (saved && saved.people) || next.people || [];
          if (!M.state.sources) M.state.sources = { members: [], contacts: [], cards: [], lists: [], failed: [] };
          M.state.sources.contacts = list.slice();
          M.rebuildIndex();
          return M.publishAssignee(person).then(function () { return person; });
        });
      });
    };
    M.assignPerson = function assignPerson(person) {
      if (!person) return Promise.resolve();
      if (M.isTaskPage()) return M.writeCustom(person.id, person.name, true);
      if (String(person.id).length > 32) return Promise.resolve();
      var props = M.pageProps();
      if (props.people.indexOf(person.id) >= 0) return Promise.resolve();
      if (props.people.length >= 8) {
        M.toast('Huit personnes au maximum.', 'error');
        return Promise.resolve();
      }
      props.people.push(person.id);
      return M.patchPage({ props: props }).then(function () { M.paintProps(); });
    };
    M.addPerson = function addPerson(name) {
      M.savePerson(name).then(M.assignPerson, M.failure);
    };
    M.personChoices = function personChoices(catalog) {
      var on = M.assignedIds();
      var rows = [];
      var seen = Object.create(null);
      function push(id, label) {
        id = String(id || '');
        label = String(label || '').trim();
        if (!id || !label || seen[id]) return;
        seen[id] = true;
        rows.push({
          id: id,
          label: label,
          icon: 'user',
          on: on.indexOf(id) >= 0,
          run: function () { M.closePop(); M.togglePerson(id, label); },
        });
      }
      ((M.state.sources && M.state.sources.members) || []).forEach(function (m) {
        push(m.id, m.fullName || m.name || m.username || m.id);
      });
      ((M.state.sources && M.state.sources.contacts) || []).forEach(function (p) {
        if (!p || !p.name) return;
        if (p.trelloMemberId && seen[String(p.trelloMemberId)]) return;
        push(p.id, p.name);
      });
      (catalog || []).forEach(function (c) {
        if (!c || !c.name) return;
        if (c.trelloMemberId && seen[String(c.trelloMemberId)]) return;
        push(c.id, c.name);
      });
      if (M.isTaskPage()) M.customAssignees().forEach(function (c) { push(c.id, c.name); });
      return rows;
    };
    M.openPeoplePicker = function openPeoplePicker(anchor) {
      var PT = global.PriorityTrello;
      var pending = PT && typeof PT.getCustomAssigneeCatalog === 'function'
        ? PT.getCustomAssigneeCatalog(M.t)
        : Promise.resolve([]);
      pending.then(function (catalog) {
        M.showPeoplePicker(anchor, catalog || []);
      }, function () {
        M.showPeoplePicker(anchor, []);
      });
    };
    M.showPeoplePicker = function showPeoplePicker(anchor, catalog) {
      var rows = M.personChoices(catalog);
      M.openPicker(anchor, rows, function (list, q, shown) {
        var name = S.DM().personDraft(rows.map(function (r) { return r.label; }), q);
        if (!name) return;
        var btn = S.h('button', {
          class: 'dc-menu-item',
          type: 'button',
          onclick: function () { M.closePop(); M.addPerson(name); },
        }, [S.icon('plus'), S.h('span', { text: 'Ajouter « ' + name + ' »' })]);
        list.appendChild(btn);
        if (!shown && M.pop) {
          var search = M.pop.querySelector('.dc-picker-search');
          if (search && !search._personEnter) {
            search._personEnter = true;
            search.addEventListener('keydown', function (e) {
              if (e.key !== 'Enter') return;
              var typed = S.DM().personDraft(rows.map(function (r) { return r.label; }), search.value);
              if (!typed) return;
              var query = S.DM().fold(search.value || '');
              var hits = rows.filter(function (r) { return !query || S.DM().fold(r.label).indexOf(query) >= 0; });
              if (hits.length) return;
              e.preventDefault();
              M.closePop();
              M.addPerson(typed);
            });
          }
        }
      });
    };
    M.FC = function FC() {
      return global.FieldCatalog;
    };
    M.ensureLabelCatalog = function ensureLabelCatalog() {
      if (M.state.labelCatalog) return Promise.resolve(M.state.labelCatalog);
      if (!M.t || typeof M.t.board !== 'function') {
        M.state.labelCatalog = [];
        return Promise.resolve(M.state.labelCatalog);
      }
      return M.t.board('labels').then(function (b) {
        M.state.labelCatalog = ((b && b.labels) || []).map(function (l) {
          return { id: String(l.id), name: l.name || '', color: l.color || '' };
        });
        return M.state.labelCatalog;
      }, function () {
        M.state.labelCatalog = [];
        return M.state.labelCatalog;
      });
    };
    M.mergedLabels = function mergedLabels() {
      var seen = Object.create(null);
      var out = [];
      (M.state.labelCatalog || []).concat((M.state.face && M.state.face.labels) || []).forEach(function (l) {
        if (!l || l.id == null || seen[l.id]) return;
        seen[l.id] = true;
        out.push({ id: String(l.id), name: l.name || '', color: l.color || '' });
      });
      return out;
    };
    M.nativeText = function nativeText(field) {
      var tf = M.state.taskFields || {};
      var inputs = tf.inputs || {};
      var meta = (M.state.face && M.state.face.meta) || {};
      if (field.kind === 'priority') {
        if (!tf.inputs || !global.PriorityMatrix) return '';
        var resolved = global.PriorityMatrix.resolveLabel(inputs);
        return (resolved && resolved.label) || '';
      }
      if (field.kind === 'place') {
        var at = inputs.places && inputs.places.at;
        if (at && at.name) return at.name;
        return meta.lieu || '';
      }
      if (field.kind === 'category') return tf.category || meta.categorie || '';
      if (field.kind === 'money') return meta.money || '';
      var key = M.FC().metaKey(field);
      return (key && meta[key]) || '';
    };
    M.fieldRaw = function fieldRaw(field) {
      var native = M.nativeText(field);
      if (native) return native;
      var hit = M.FC().valueOn(field, (M.state.face && M.state.face.labels) || []);
      return hit ? hit.value : '';
    };
    M.stripField = function stripField(fieldId) {
      var fc = M.FC();
      if (!fc || !M.state.current || !M.state.current.subject) return Promise.resolve();
      var ids = ((M.state.face && M.state.face.labels) || []).map(function (l) { return l.id; });
      var next = fc.without(M.mergedLabels(), ids, fieldId);
      if (next.join(',') === ids.join(',')) return Promise.resolve();
      return S.DT().setCardLabels(M.t, M.state.current.subject.id, next);
    };
    M.writePlace = function writePlace(cardId, value) {
      var PT = global.PriorityTrello;
      var UI = global.PriorityUI;
      var remembered = S.DT().saveCardMeta(M.t, cardId, 'lieu', value);
      if (!PT || typeof PT.getCardInputsById !== 'function' || typeof PT.saveCardInputsById !== 'function' || !UI || typeof UI.createPlaceRef !== 'function') {
        return remembered;
      }
      return PT.getCardInputsById(M.t, cardId).then(function (inputs) {
        if (!inputs) return remembered;
        var places = Object.assign({}, inputs.places || {});
        if (!value) delete places.at;
        else {
          var found = typeof UI.findPlaceCatalogByName === 'function' ? UI.findPlaceCatalogByName(value) : null;
          places.at = found || UI.createPlaceRef(value);
        }
        return PT.saveCardInputsById(M.t, cardId, { places: places }).then(function () { return remembered; });
      }, function () { return remembered; });
    };
    M.writeCategory = function writeCategory(cardId, value) {
      var TT = global.TableTrello;
      var sheets = global.SheetsTrello;
      var fieldId = M.state.taskFields && M.state.taskFields.categoryFieldId;
      function viaMeta() {
        return S.DT().saveCardMeta(M.t, cardId, 'categorie', value);
      }
      if (!TT || typeof TT.saveCategory !== 'function') return viaMeta();
      var ensure = fieldId
        ? Promise.resolve(fieldId)
        : sheets && typeof sheets.ensureCategoryCustomField === 'function'
          ? sheets.ensureCategoryCustomField(M.t).then(function (res) { return res && res.data && res.data.id; }, function () { return null; })
          : Promise.resolve(null);
      return ensure.then(function (id) {
        if (!id) return viaMeta();
        return TT.saveCategory(M.t, cardId, id, value).then(function () {
          if (M.state.taskFields) {
            M.state.taskFields.categoryFieldId = id;
            M.state.taskFields.category = value || '';
          }
        }, viaMeta);
      }, viaMeta);
    };
    M.commitField = function commitField(field, value) {
      if (!M.state.current || !M.state.current.subject) return;
      var cardId = M.state.current.subject.id;
      var job;
      if (field.kind === 'place') job = M.writePlace(cardId, value);
      else if (field.kind === 'category') job = M.writeCategory(cardId, value);
      else if (field.kind === 'priority') job = Promise.resolve();
      else job = S.DT().saveCardMeta(M.t, cardId, M.FC().metaKey(field), value);
      job.then(function () { return M.stripField(field.id); }).then(function () { M.loadFace(); }, M.failure);
    };
    M.editPriority = function editPriority(anchor) {
      if (!global.CardFields || !M.isTaskPage()) return;
      global.CardFields.open('priority', {
        t: M.t, cardId: M.state.current.subject.id, cardName: M.state.face.name, anchor: anchor,
        onSaved: function () { M.stripField('priority').then(function () { M.loadFace(); }, M.failure); },
      });
    };
    M.openFieldPicker = function openFieldPicker(anchor, field) {
      var fc = M.FC();
      var current = M.fieldRaw(field);
      var rows = field.options.map(function (o) {
        var label = fc.pretty(o.value);
        return {
          label: label,
          icon: field.icon,
          on: fc.fold(o.value) === fc.fold(current),
          run: function () {
            M.closePop();
            M.commitField(field, fc.fold(o.value) === fc.fold(current) ? '' : o.value);
          },
        };
      });
      if (current && !rows.some(function (r) { return fc.fold(r.label) === fc.fold(current); })) {
        rows.unshift({
          label: fc.pretty(current),
          icon: field.icon,
          on: true,
          run: function () { M.closePop(); M.commitField(field, ''); },
        });
      }
      M.openPicker(anchor, rows, function (list, q) {
        var typed = String(q || '').trim();
        if (!typed || typed.length > 40) return;
        var query = fc.fold(typed);
        var exists = rows.some(function (r) { return fc.fold(r.label).indexOf(query) >= 0; });
        if (exists) return;
        list.appendChild(S.h('button', {
          class: 'dc-menu-item',
          type: 'button',
          onclick: function () { M.closePop(); M.commitField(field, typed); },
        }, [S.icon(field.icon), S.h('span', { text: typed })]));
      });
    };
    M.openField = function openField(field, anchor) {
      if (field.kind === 'priority') M.editPriority(anchor);
      else M.openFieldPicker(anchor, field);
    };
    M.paintLabelBag = function paintLabelBag(labels) {
      M.els.props.appendChild(M.propRow('tags', 'Étiquettes', function (v) {
        if (!labels.length) v.appendChild(M.emptyBtn('Cliquer pour ajouter…', function (e) { M.openLabelPicker(e.currentTarget); }));
        labels.forEach(function (l) {
          v.appendChild(M.chip(l.name || 'Étiquette', {
            color: l.color,
            onClick: function (e) { M.openLabelPicker(e.currentTarget); },
            onRemove: function () {
              var ids = (M.state.face.labels || []).map(function (x) { return x.id; }).filter(function (id) { return id !== l.id; });
              S.DT().setCardLabels(M.t, M.state.current.subject.id, ids).then(function () { M.loadFace(); }, M.failure);
            },
          }));
        });
        M.endList(v, 'labels', M.plusBtn('Ajouter une étiquette', function (btn) { M.openLabelPicker(btn); }));
      }));
    };
    M.paintTaskFields = function paintTaskFields() {
      var fc = M.FC();
      if (!fc || M.state.labelCatalog == null) {
        M.paintLabelBag(M.state.face.labels || []);
        return;
      }
      var fields = fc.catalog(M.mergedLabels());
      fields.forEach(function (field) {
        M.els.props.appendChild(M.propRow(field.icon, field.label, function (v) {
          var raw = M.fieldRaw(field);
          var text = raw ? fc.pretty(raw) : '';
          var fromLabel = !M.nativeText(field) && fc.valueOn(field, M.state.face.labels || []);
          if (!text) {
            v.appendChild(M.emptyBtn('Cliquer pour ajouter…', function (e) { M.openField(field, e.currentTarget); }));
          } else {
            v.appendChild(M.chip(text, {
              onClick: function (e) { M.openField(field, e.currentTarget); },
              onRemove: field.kind === 'priority' && !fromLabel ? null : function () { M.commitField(field, ''); },
            }));
          }
          M.endList(v, 'field:' + field.id, M.plusBtn('Ajouter', function (btn) { M.openField(field, btn); }));
        }));
      });
      var loose = fc.loose(M.state.face.labels || []);
      if (!fields.length) M.paintLabelBag(M.state.face.labels || []);
      else if (loose.length) M.paintLabelBag(loose);
    };
    M.openLabelPicker = function openLabelPicker(anchor) {
      M.ensureLabelCatalog().then(function () {
        var fc = M.FC();
        var labels = fc ? fc.loose(M.mergedLabels()) : (M.state.labelCatalog || []);
        var on = ((M.state.face && M.state.face.labels) || []).map(function (l) { return l.id; });
        M.openPicker(anchor, labels.map(function (l) {
          return {
            label: l.name || 'Étiquette',
            icon: 'tag',
            on: on.indexOf(l.id) >= 0,
            run: function () {
              M.closePop();
              var ids = on.slice();
              var i = ids.indexOf(l.id);
              if (i >= 0) ids.splice(i, 1);
              else ids.push(l.id);
              S.DT().setCardLabels(M.t, M.state.current.subject.id, ids).then(function () { M.loadFace(); }, M.failure);
            },
          };
        }));
      }, M.failure);
    };
    M.editDue = function editDue(anchor) {
      if (!global.CardFields || !M.isTaskPage()) return;
      global.CardFields.open('due', {
        t: M.t, cardId: M.state.current.subject.id, cardName: M.state.face.name, anchor: anchor,
        onSaved: function () { M.loadFace(); },
      });
    };
    M.commitTag = function commitTag(input) {
      var raw = input.value;
      if (!raw || !String(raw).trim()) return;
      var props = M.pageProps();
      props.tags = props.tags.concat([raw]);
      input.value = '';
      M.patchPage({ props: props }).then(function () { M.paintProps(); });
    };
    M.childDocs = function childDocs() {
      var id = M.state.current && M.state.current.id;
      if (!id) return [];
      var parents = (M.state.idx && M.state.idx.parents) || {};
      var folder = S.DM().folderByDoc(M.state.idx, id);
      var skip = {};
      (M.state.idx.folders || []).forEach(function (f) { if (f.doc) skip[f.doc] = true; });
      return M.state.docs.filter(function (d) {
        if (d.id === id || skip[d.id]) return false;
        if (parents[d.id] === id) return true;
        return !!(folder && M.state.idx.docs[d.id] === folder.id);
      });
    };
    M.childFolders = function childFolders() {
      var folder = M.state.current && S.DM().folderByDoc(M.state.idx, M.state.current.id);
      if (!folder) return [];
      return M.state.idx.folders.filter(function (f) {
        return f.parent === folder.id && (M.state.showArchived || !f.archived);
      }).sort(function (a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; });
    };
    M.paintParent = function paintParent() {
      var cur = M.state.current;
      var parents = (M.state.idx && M.state.idx.parents) || {};
      var pid = cur && parents[cur.id];
      var parent = pid && M.state.docs.filter(function (d) { return d.id === pid; })[0];
      if (!parent && cur && M.state.idx && M.state.idx.docs[cur.id]) {
        var holder = S.DM().folderById(M.state.idx, M.state.idx.docs[cur.id]);
        if (holder && holder.doc && holder.doc !== cur.id) parent = M.state.docs.filter(function (d) { return d.id === holder.doc; })[0];
      }
      if (!parent && cur) {
        var me = S.DM().folderByDoc(M.state.idx, cur.id);
        var up = me && me.parent && S.DM().folderById(M.state.idx, me.parent);
        if (up && up.doc) parent = M.state.docs.filter(function (d) { return d.id === up.doc; })[0];
      }
      M.els.parent.hidden = !parent;
      M.els.parent.textContent = '';
      if (!parent) return;
      M.els.parent.appendChild(S.icon('corner-down-right'));
      M.els.parent.appendChild(document.createTextNode(parent.title));
      M.els.parent.onclick = function () { M.openDoc(parent.id); };
    };
    M.loadFace = function loadFace() {
      var cur = M.state.current;
      var sub = cur && cur.subject;
      var token = ++M.faceToken;
      M.state.face = null;
      M.state.taskFields = null;
      M.paintProps();
      if (!sub || sub.k === 'project' || sub.k === 'day') return;
      var req = sub.k === 'task' ? S.DT().loadCardFace(M.t, sub.id) : S.DT().loadEntityFace(M.t, sub.id);
      req.then(function (face) {
        if (token !== M.faceToken || !M.state.current || !M.state.current.subject || M.state.current.subject.id !== sub.id) return;
        M.state.face = face;
        var extra = sub.k === 'task'
          ? Promise.all([
            M.ensureLabelCatalog(),
            S.DT().loadTaskFields ? S.DT().loadTaskFields(M.t, sub.id).catch(function () { return null; }) : Promise.resolve(null),
          ])
          : Promise.resolve(null);
        return extra.then(function (pair) {
          if (token !== M.faceToken) return;
          if (pair && pair[1]) M.state.taskFields = pair[1];
          M.paintProps();
        });
      }, function () {
        if (token !== M.faceToken) return;
        M.state.face = { missing: true, id: sub.id };
        M.paintProps();
      });
    };
    M.paintProps = function paintProps() {
      var active = document.activeElement;
      if (active && M.els.props.contains(active) && active.tagName === 'INPUT') return;
      M.els.props.textContent = '';
      M.paintParent();
      var cur = M.state.current;
      if (!cur) return;
      if (M.state.propFor !== cur.id) {
        M.state.propFor = cur.id;
        M.state.propOpen = {};
      }
      var sub = cur.kind === 'task' ? null : cur.subject;
      if (cur.kind !== 'task' && !sub) {
        M.els.props.appendChild(M.propRow('link', 'Lié à', function (v) {
          v.appendChild(M.emptyBtn('Cliquer pour lier…', function (e) { M.openLinkPicker(e.currentTarget); }));
        }));
      } else if (sub && sub.k !== 'project' && sub.k !== 'day') {
        var face = M.state.face;
        var missing = !!(face && face.missing);
        var name = (face && face.name) || (sub.k === 'entity' ? 'Entité' : 'Tâche');
        M.els.props.appendChild(M.propRow(sub.k === 'entity' ? 'stack-2' : 'checkbox', sub.k === 'entity' ? 'Entité' : 'Tâche', function (v) {
          v.appendChild(M.chip(missing ? 'Introuvable' : name, {
            dim: missing,
            onClick: function () {
              if (missing) return;
              if (sub.k === 'task') M.openTask(sub.id, name);
              else if (sub.k === 'entity' && global.ViewTabs) global.location.assign(global.ViewTabs.hrefForSubject('./entities.html', global.location, 'entity', sub.id));
            },
            onRemove: function () { M.patchPage({ subject: null }).then(function () { M.loadFace(); }); },
          }));
          M.endList(v, 'subject', null);
        }));
      }
      if (M.isTaskPage()) {
        M.els.props.appendChild(M.propRow('users', 'Personnes', function (v) {
          var people = (M.state.face.members || []).map(function (m) {
            return { id: m.id, name: m.name || M.memberName(m.id) };
          }).concat(M.customAssignees());
          if (!people.length) v.appendChild(M.emptyBtn('Cliquer pour ajouter…', function (e) { M.openPeoplePicker(e.currentTarget); }));
          people.forEach(function (m) {
            v.appendChild(M.chip(m.name || M.memberName(m.id), {
              onClick: function (e) { M.openPeoplePicker(e.currentTarget); },
              onRemove: function () { M.togglePerson(m.id, m.name); },
            }));
          });
          M.endList(v, 'people', M.plusBtn('Ajouter une personne', function (btn) { M.openPeoplePicker(btn); }));
        }));
        M.paintTaskFields();
        M.els.props.appendChild(M.propRow('calendar-event', 'Échéance', function (v) {
          var due = M.dueLabel(M.state.face.due);
          v.appendChild(due
            ? S.h('button', { class: 'dc-prop-text', type: 'button', onclick: function (e) { M.editDue(e.currentTarget); } }, [due])
            : M.emptyBtn('Cliquer pour ajouter…', function (e) { M.editDue(e.currentTarget); }));
        }));
      } else if (cur.kind !== 'task' && (!sub || sub.k === 'entity')) {
        if (sub && M.state.face && M.state.face.aliases && M.state.face.aliases.length) {
          M.els.props.appendChild(M.propRow('quote', 'Alias', function (v) {
            M.state.face.aliases.forEach(function (a) { v.appendChild(S.h('span', { class: 'dc-chip is-quiet', title: a, text: a })); });
            M.endList(v, 'alias', null);
          }));
        }
        M.els.props.appendChild(M.propRow('users', 'Personnes', function (v) {
          var people = M.pageProps().people;
          if (!people.length) v.appendChild(M.emptyBtn('Cliquer pour ajouter…', function (e) { M.openPeoplePicker(e.currentTarget); }));
          people.forEach(function (id) {
            v.appendChild(M.chip(M.memberName(id), {
              onClick: function (e) { M.openPeoplePicker(e.currentTarget); },
              onRemove: function () { M.togglePerson(id); },
            }));
          });
          M.endList(v, 'people', M.plusBtn('Ajouter une personne', function (btn) { M.openPeoplePicker(btn); }));
        }));
      }
      if (cur.kind !== 'task') {
      var tags = M.pageProps().tags;
      M.els.props.appendChild(M.propRow('tag', 'Mots-clés', function (v) {
        tags.forEach(function (tag) {
          v.appendChild(M.chip(tag, {
            onRemove: function () {
              var props = M.pageProps();
              props.tags = props.tags.filter(function (x) { return x.toLowerCase() !== tag.toLowerCase(); });
              M.patchPage({ props: props }).then(function () { M.paintProps(); });
            },
          }));
        });
        var input = S.h('input', {
          class: 'dc-tag-input' + (tags.length ? '' : ' is-empty'),
          type: 'text',
          placeholder: tags.length ? '' : 'Cliquer pour ajouter…',
          'aria-label': 'Mot-clé',
          maxlength: '20',
          onkeydown: function (e) {
            if (e.key === 'Enter') {
              e.preventDefault();
              M.commitTag(e.target);
              e.target.blur();
            } else if (e.key === 'Escape') { e.target.value = ''; e.target.blur(); }
          },
          onblur: function (e) {
            M.commitTag(e.target);
            if (!String(e.target.value || '').trim() && tags.length && e.target.parentNode) e.target.parentNode.removeChild(e.target);
          },
        });
        if (!tags.length) v.appendChild(input);
        M.endList(v, 'tags', M.plusBtn('Ajouter un mot-clé', function () {
          var bits = v.querySelector('.dc-prop-bits');
          var plus = bits && bits.querySelector('.dc-prop-add');
          if (bits && input.parentNode !== bits) {
            if (plus) bits.insertBefore(input, plus);
            else bits.appendChild(input);
          }
          input.focus();
        }));
      }));
      }
      M.els.props.appendChild(M.propRow('files', 'Documents', function (v) {
        M.childFolders().forEach(function (f) {
          v.appendChild(S.h('button', { class: 'dc-subdoc', type: 'button', title: M.folderLabel(f), onclick: function () { M.openFolder(f.id); } }, [
            S.icon('folder'),
            S.h('span', { text: M.folderLabel(f) }),
          ]));
        });
        M.childDocs().forEach(function (d) {
          v.appendChild(S.h('button', { class: 'dc-subdoc', type: 'button', title: d.title, onclick: function () { M.openDoc(d.id); } }, [
            S.icon(M.subjectGlyph(d.subject)),
            S.h('span', { text: d.title }),
          ]));
        });
        M.endList(v, 'docs', M.plusBtn('Nouveau sous-document', function () { M.newDoc(null, null, null, cur.id); }));
      }));
      M.scheduleClips();
    };
    M.lastDomMd = function lastDomMd() {
      return M.editor ? S.DM().domToMd(M.editor) : '';
    };
    M.paintOutline = function paintOutline() {
      M.els.outline.textContent = '';
      if (!M.editor) return;
      var heads = Array.prototype.slice.call(M.editor.querySelectorAll('h1,h2,h3')).filter(function (x) {
        return /\S/.test(x.textContent);
      });
      M.els.outline.classList.toggle('is-empty', !heads.length);
      if (!heads.length) return;
      M.els.outline.appendChild(S.h('div', { class: 'dc-outline-title', text: 'Plan' }));
      heads.forEach(function (el) {
        M.els.outline.appendChild(
          S.h('button', {
            class: 'dc-outline-item dc-outline-item--' + el.tagName.toLowerCase(),
            title: el.textContent,
            onclick: function () {
              el.scrollIntoView({ block: 'start', behavior: 'smooth' });
            },
          }, [el.textContent])
        );
      });
    };
    M.buildEditor = function buildEditor(doc) {
      var old = M.els.page.querySelector('.dc-editor');
      var ed = S.h('div', {
        class: 'dc-editor',
        contenteditable: 'true',
        spellcheck: 'true',
        lang: 'fr',
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': 'Contenu du document',
        'data-placeholder': 'Écrivez ici… « / » pour les commandes, « @ » pour mentionner une personne, « @@ » une tâche, « @@@ » un document',
      });
      ed.innerHTML = S.DM().mdToHtml(doc.body);
      if (old) M.els.page.replaceChild(ed, old);
      else M.els.page.appendChild(ed);
      M.editor = ed;
      doc.savedCover = doc.cover || null;
      M.paintCover();
      M.attachEditor(ed);
      M.lastRange = null;
      M.ensureTail();
      M.fixImages();
      M.fixTables();
      M.hydrateImages();
      M.hideBlockUi();
      M.lastMd = S.DM().domToMd(ed); // baseline = the normalized form, so opening never rewrites a document
      M.paintEmptyClass();
      M.refreshChips();
      M.watchEntities(ed);
      M.paintOutline();
      M.paintMeta();
      M.paintToolbarState();
      M.loadFace();
    };
    M.attachEditor = function attachEditor(ed) {
      ed.addEventListener('input', M.onInput);
      ed.addEventListener('keydown', M.onKeydown);
      ed.addEventListener('paste', M.onPaste);
      ed.addEventListener('dragover', M.onEditorDragOver);
      ed.addEventListener('drop', M.onEditorDrop);
      ed.addEventListener('blur', function () {
        M.saveSel();
        if (M.state.saveState === 'dirty') M.saveNow();
      });
      ed.addEventListener('mousedown', function (e) {
        if (e.target === ed && e.button === 0) {
          var under = M.preBelowClick(e.clientY);
          if (under) {
            e.preventDefault();
            M.focusEdge(M.placeAfter(under), false);
            return;
          }
          M.ensureTail();
          var tail = ed.lastElementChild;
          if (tail && tail.tagName === 'P') M.focusInside(tail);
        }
        var li = e.target && e.target.closest && e.target.closest('.dc-todo > li');
        if (li && ed.contains(li) && e.offsetX >= 0 && e.clientX - li.getBoundingClientRect().left < 24 && e.target === li) {
          e.preventDefault();
          li.setAttribute('data-checked', li.getAttribute('data-checked') === 'true' ? 'false' : 'true');
          M.onEdit();
          M.followCheckbox(li);
        }
      });
      ed.addEventListener('click', M.onEditorClick);
      ed.addEventListener('focusout', function () { M.syncDayPage(); });
      ed.addEventListener('contextmenu', M.onEditorContextMenu, true);
      ed.addEventListener('mouseover', function (e) {
        var chip = e.target.closest && e.target.closest('.dc-mention--task');
        if (!chip || !ed.contains(chip) || (M.pop && !(M.previewChip && !M.previewPinned))) return;
        clearTimeout(M.previewTimer);
        M.previewTimer = setTimeout(function () { if (!M.pop || !M.previewPinned) M.openTaskPreview(chip, false); }, 350);
      });
      ed.addEventListener('mouseout', function (e) {
        var chip = e.target.closest && e.target.closest('.dc-mention--task');
        if (!chip) return;
        clearTimeout(M.previewTimer);
        if (!M.previewPinned) M.scheduleClosePreview();
      });
      if (!M.attachEditor.hot) {
        M.attachEditor.hot = true;
        document.addEventListener('selectionchange', function () {
          if (M.editor) M.paintLiveHot();
        });
      }
    };
    M.onEditorClick = function onEditorClick(e) {
      var chip = e.target.closest && e.target.closest('.dc-mention');
      if (chip && M.editor.contains(chip)) {
        e.preventDefault();
        M.openMention(chip);
        return;
      }
      var a = e.target.closest && e.target.closest('a');
      if (a && M.editor.contains(a)) {
        e.preventDefault();
        var docId = M.anchorDocId(a);
        if (docId) {
          if (M.state.docs.some(function (d) { return d.id === docId; }) || (M.state.current && M.state.current.id === docId)) M.openDoc(docId);
          else M.toast('Ce document est introuvable.', 'error');
          return;
        }
        if (e.ctrlKey || e.metaKey) global.open(a.getAttribute('href'), '_blank', 'noopener');
        else M.openLinkPopover(a);
      }
    };
    M.onInput = function onInput(e) {
      var type = e.inputType || '';
      if (type === 'insertParagraph') {
        // a new checklist item must start unchecked
        var n = M.selNode();
        var li = n && M.closestIn(n, 'LI');
        if (li && li.parentNode && li.parentNode.classList && li.parentNode.classList.contains('dc-todo')) li.setAttribute('data-checked', 'false');
      }
      if (type === 'insertText' && (e.data === ' ' || e.data === '\u00a0')) {
        // editing commands are refused while another one is still dispatching this very event,
        // so the space-triggered rewrites run once it has returned (before any further keystroke)
        Promise.resolve().then(function () {
          if (!M.editor) return;
          M.dropSpaceAfterChip();
          M.applyMarkdownShortcut();
          M.onEdit();
        });
      }
      if (!e.isComposing && type === 'insertText' && e.data && /[*~=`+\]]/.test(e.data)) {
        Promise.resolve().then(function () {
          if (!M.editor) return;
          if (M.applyWikiClose() || M.applyInlineLive()) M.onEdit('text');
          M.paintLiveHot();
        });
      }
      M.onEdit(type === 'insertText' || type === 'insertCompositionText' || type.indexOf('delete') === 0 ? 'text' : '');
      M.updateSuggest();
    };
    M.applyMarkdownShortcut = function applyMarkdownShortcut() {
      var n = M.selNode();
      if (!n) return;
      var block = M.closestIn(n, 'P,DIV');
      if (!block || M.closestIn(block, 'PRE') || M.closestIn(block, 'TD,TH')) return;
      var text = block.textContent.replace(/[\u00a0\u200b]/g, ' ');
      var cmd = null;
      var m = /^(#{1,3}) $/.exec(text);
      if (m) cmd = 'h' + m[1].length;
      else if (/^[-*] $/.test(text)) cmd = 'ul';
      else if (/^1[.)] $/.test(text)) cmd = 'ol';
      else if (/^\[ ?\] $/.test(text)) cmd = 'todo';
      else if (/^> $/.test(text)) cmd = 'quote';
      if (!cmd) return;
      var r = document.createRange();
      r.selectNodeContents(block);
      var sel = global.getSelection();
      sel.removeAllRanges();
      sel.addRange(r);
      document.execCommand('delete');
      M.runCommand(cmd, { silent: true });
    };
    M.liveTextNode = function liveTextNode() {
      var sel = global.getSelection();
      if (!sel || !sel.isCollapsed || !sel.rangeCount || !M.editor || !M.editor.contains(sel.anchorNode)) return null;
      var node = sel.anchorNode;
      if (!node || node.nodeType !== 3) return null;
      if (M.closestIn(node, 'PRE,CODE')) return null;
      return node;
    };
    },
    run: function (M) {
    M.whoMe = null;
    M.LABEL_BG = {
      green: '#216e4e', yellow: '#7f5f01', orange: '#a54800', red: '#ae2e24',
      purple: '#5e4db2', blue: '#0055cc', sky: '#206a83', lime: '#4c6b1f',
      pink: '#943d73', black: '#44546f',
    };
    M.DUE_MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
    }
  });
})(typeof window !== 'undefined' ? window : this);
