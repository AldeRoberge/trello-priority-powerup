/**
 * priority-ui-info-field: createInfoField() part 2 of 8.
 * The body of createInfoField runs in order across these parts; its locals live on the per-call state object (M).
 * Order and shared names: see priority-ui-info-field.parts.json and docs/architecture.md.
 */
(function (global) {
  'use strict';

  var S = (global.PriorityUIParts = global.PriorityUIParts || {});
  var P = (global.PriorityUIPartsMountCreateInfoField = global.PriorityUIPartsMountCreateInfoField || { list: [] });

  P.list.push({
    define: function (M) {
    M.makeInlineMountRow = function makeInlineMountRow(key, labelText, icon) {
      var row = M.makeRow(key, labelText, { icon: icon });
      row.row.classList.add('info-row--inline-feature');
      row.row.hidden = true;
      var mount = document.createElement('div');
      mount.className = 'info-inline-mount info-inline-mount--' + key;
      row.value.appendChild(mount);
      M.body.appendChild(row.row);
      return { row: row.row, mount: mount };
    };
    M.syncTaskTypesCreateIconBtn = function syncTaskTypesCreateIconBtn() {
      M.taskTypesCreateIconBtn.innerHTML = S.taskTypeIconSvg(
        M.taskTypesCreateIconKey,
        'info-task-type-icon'
      );
      M.taskTypesCreateIconBtn.setAttribute(
        'aria-expanded',
        M.taskTypesIconPickerOpen ? 'true' : 'false'
      );
      M.taskTypesCreateIconWrap.classList.toggle(
        'is-open',
        M.taskTypesIconPickerOpen
      );
    };
    M.setTaskTypesIconPickerOpen = function setTaskTypesIconPickerOpen(open) {
      M.taskTypesIconPickerOpen = !!open;
      M.taskTypesIconPicker.hidden = !M.taskTypesIconPickerOpen;
      if (M.taskTypesIconPickerOpen) M.renderTaskTypesIconPicker();
      M.syncTaskTypesCreateIconBtn();
      M.onLayoutChange();
      if (M.taskTypesPickerOpen) {
        requestAnimationFrame(M.positionTaskTypesPicker);
      }
    };
    M.setTaskTypesCreateIconKey = function setTaskTypesCreateIconKey(key, options) {
      options = options || {};
      M.taskTypesCreateIconKey = S.normalizeTaskTypeIconKey(key, M.taskTypesCreateIconKey);
      M.syncTaskTypesCreateIconBtn();
      if (M.taskTypesIconPickerOpen) M.renderTaskTypesIconPicker();
      if (options.close !== false) M.setTaskTypesIconPickerOpen(false);
    };
    M.randomizeTaskTypesCreateIcon = function randomizeTaskTypesCreateIcon() {
      M.setTaskTypesCreateIconKey(S.randomTaskTypeIconKey(), { close: true });
    };
    M.renderTaskTypesIconPicker = function renderTaskTypesIconPicker() {
      M.taskTypesIconPicker.replaceChildren();
      S.getTaskTypeIconKeys().forEach(function (iconKey) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'info-task-types-icon-picker-option';
        btn.setAttribute('role', 'option');
        btn.dataset.iconKey = iconKey;
        btn.title = iconKey;
        btn.setAttribute('aria-label', 'Ic\u00f4ne\u00a0: ' + iconKey);
        btn.setAttribute(
          'aria-selected',
          iconKey === M.taskTypesCreateIconKey ? 'true' : 'false'
        );
        if (iconKey === M.taskTypesCreateIconKey) {
          btn.classList.add('is-selected');
        }
        btn.innerHTML = S.taskTypeIconSvg(iconKey);
        btn.addEventListener('click', function (event) {
          event.preventDefault();
          event.stopPropagation();
          M.setTaskTypesCreateIconKey(iconKey);
        });
        M.taskTypesIconPicker.appendChild(btn);
      });
    };
    M.setAuthHint = function setAuthHint(reason) {
      M.authReason = reason || '';
      var show = !!M.authReason;
      M.authBox.hidden = !show;
      if (!show) {
        M.authHint.textContent = '';
        return;
      }
      if (M.authReason === 'no-app-key') {
        M.authHint.textContent =
          'Enregistrement du titre, de la description et des \u00e9tiquettes indisponible (cl\u00e9 d\u2019app manquante).';
        M.authBtn.hidden = true;
      } else {
        M.authHint.textContent =
          'Autorisez Trello pour enregistrer le titre, la description et les \u00e9tiquettes sur la carte.';
        M.authBtn.hidden = !M.onAuthorize;
      }
    };
    M.applyInfoSaveStatus = function applyInfoSaveStatus(el, text, kind) {
      var saving = kind === 'saving' || text === 'Enregistrement\u2026';
      var saved = kind === 'ok';
      var errored = kind === 'error';
      el.classList.toggle('is-saving', !!saving);
      el.classList.toggle('is-ok', !!saved && !saving);
      el.classList.toggle('is-error', !!errored && !saving && !saved);
      if (saving) {
        el.innerHTML = '<i class="ti ti-loader-2" aria-hidden="true"></i>';
        el.setAttribute('aria-label', 'Enregistrement');
        el.title = 'Enregistrement\u2026';
        return;
      }
      if (saved) {
        el.innerHTML = '<i class="ti ti-loader-2" aria-hidden="true"></i>';
        el.setAttribute('aria-label', 'Enregistr\u00e9');
        el.title = 'Enregistr\u00e9';
        return;
      }
      el.removeAttribute('title');
      el.removeAttribute('aria-label');
      el.textContent = text || '';
    };
    M.setTitleStatus = function setTitleStatus(text, kind) {
      M.applyInfoSaveStatus(M.titleStatus, text, kind);
    };
    M.setDescStatus = function setDescStatus(text, kind) {
      M.applyInfoSaveStatus(M.descStatus, text, kind);
    };
    M.syncDescInputSize = function syncDescInputSize() {
      var empty = !(M.descInput.value || '').trim();
      S.syncExpandableSurfaceHeight(M.descInput, {
        maxHeight: S.INFO_DESC_MAX_HEIGHT_PX,
        minHeight: empty ? S.INFO_DESC_EMPTY_MIN_HEIGHT_PX : S.INFO_DESC_MIN_HEIGHT_PX
      });
    };
    M.syncDescRichSize = function syncDescRichSize() {
      var empty = !S.markdownFromRichRoot(M.descRich);
      M.descRich.classList.toggle('is-empty', empty);
      S.syncExpandableSurfaceHeight(M.descRich, {
        maxHeight: S.INFO_DESC_MAX_HEIGHT_PX,
        minHeight: empty ? S.INFO_DESC_EMPTY_MIN_HEIGHT_PX : S.INFO_DESC_MIN_HEIGHT_PX
      });
    };
    M.renderDescRich = function renderDescRich() {
      M.descRich.innerHTML = S.renderMarkdownToHtml(M.descInput.value);
      M.descRich.querySelectorAll('input[type="checkbox"]').forEach(function (checkbox) {
        checkbox.disabled = false;
        checkbox.setAttribute('contenteditable', 'false');
      });
      M.syncDescRichSize();
    };
    M.syncDescSourceFromRich = function syncDescSourceFromRich() {
      if (M.descMode !== 'rich') return M.descInput.value;
      var next = S.markdownFromRichRoot(M.descRich);
      if (next !== M.descInput.value) M.descInput.value = next;
      return next;
    };
    M.closeDescFormatMenu = function closeDescFormatMenu() {
      M.descFormatMenu.hidden = true;
      M.descFormatWrap.classList.remove('is-open');
      M.descFormatBtn.setAttribute('aria-expanded', 'false');
    };
    M.openDescFormatMenu = function openDescFormatMenu() {
      M.descFormatMenu.hidden = false;
      M.descFormatWrap.classList.add('is-open');
      M.descFormatBtn.setAttribute('aria-expanded', 'true');
      M.syncDescFormatMenuSelection();
    };
    M.syncDescFormatMenuSelection = function syncDescFormatMenuSelection() {
      var kind = 'normal';
      if (M.descMode === 'rich') {
        try {
          var block = String(document.queryCommandValue('formatBlock') || '').toLowerCase();
          if (/^h[1-6]$/.test(block)) kind = block;
          else if (document.queryCommandState('insertOrderedList')) kind = 'ol';
          else if (document.queryCommandState('insertUnorderedList')) kind = 'ul';
        } catch (e) {
          kind = 'normal';
        }
      } else {
        var lineStart =
          M.descInput.value.lastIndexOf('\n', Math.max(0, M.descInput.selectionStart) - 1) + 1;
        var lineEnd = M.descInput.value.indexOf('\n', M.descInput.selectionStart);
        if (lineEnd === -1) lineEnd = M.descInput.value.length;
        kind = S.detectMarkdownLineFormat(M.descInput.value.slice(lineStart, lineEnd));
      }
      if (!M.DESC_FORMAT_LABELS[kind]) kind = 'normal';
      M.descFormatBtnLabel.textContent = M.DESC_FORMAT_LABELS[kind] || 'Texte normal';
      var options = M.descFormatMenu.querySelectorAll('[data-md-kind]');
      for (var i = 0; i < options.length; i += 1) {
        var opt = options[i];
        var selected = opt.getAttribute('data-md-kind') === kind;
        opt.classList.toggle('is-selected', selected);
        opt.setAttribute('aria-selected', selected ? 'true' : 'false');
      }
    };
    M.getDescEditState = function getDescEditState() {
      return {
        value: M.descInput.value,
        start: M.descInput.selectionStart,
        end: M.descInput.selectionEnd
      };
    };
    M.applyDescMarkdownInline = function applyDescMarkdownInline(open, close) {
      S.applyMarkdownEditToTextarea(
        M.descInput,
        S.wrapMarkdownInlineSelection(M.getDescEditState(), open, close)
      );
      M.syncDescFormatMenuSelection();
      try {
        M.descInput.focus();
      } catch (e) {
        /* ignore */
      }
    };
    M.applyDescMarkdownBlock = function applyDescMarkdownBlock(kind) {
      S.applyMarkdownEditToTextarea(
        M.descInput,
        S.applyMarkdownBlockFormat(M.getDescEditState(), kind)
      );
      M.syncDescFormatMenuSelection();
      try {
        M.descInput.focus();
      } catch (e) {
        /* ignore */
      }
    };
    M.execDescRichCommand = function execDescRichCommand(command, value) {
      try {
        M.descRich.focus();
        document.execCommand(command, false, value == null ? null : value);
      } catch (e) {
        /* unsupported browser command */
      }
      M.syncDescSourceFromRich();
      M.scheduleDescSave();
      M.syncDescRichSize();
      M.syncDescFormatMenuSelection();
      M.onLayoutChange();
    };
    M.getDescRichSelection = function getDescRichSelection() {
      try {
        var sel = window.getSelection && window.getSelection();
        if (!sel || sel.rangeCount === 0) return null;
        var anchor = sel.anchorNode;
        if (!anchor || !M.descRich.contains(anchor)) return null;
        return sel;
      } catch (e) {
        return null;
      }
    };
    M.decorateDescRichLink = function decorateDescRichLink(anchor, url) {
      if (!anchor) return;
      try {
        anchor.setAttribute('href', url);
        anchor.className = 'info-md-link';
        if (/^mailto:/i.test(url)) {
          anchor.removeAttribute('target');
          anchor.removeAttribute('rel');
        } else {
          anchor.setAttribute('target', '_blank');
          anchor.setAttribute('rel', 'noopener noreferrer');
        }
      } catch (e) {
        /* ignore */
      }
    };
    M.findDescRichLinkFromSelection = function findDescRichLinkFromSelection(sel) {
      if (!sel || !sel.anchorNode) return null;
      var node = sel.anchorNode;
      if (node.nodeType === 3) node = node.parentNode;
      while (node && node !== M.descRich) {
        if (S.richNodeName(node) === 'A') return node;
        node = node.parentNode;
      }
      return null;
    };
    M.applyDescRichLink = function applyDescRichLink(url) {
      var href = S.normalizePasteableMarkdownUrl(url) || S.safeMarkdownHref(url);
      if (!href) return false;
      try {
        M.descRich.focus();
      } catch (e) {
        /* ignore */
      }
      var sel = M.getDescRichSelection();
      if (sel && !sel.isCollapsed) {
        try {
          document.execCommand('createLink', false, href);
        } catch (err) {
          return false;
        }
        M.decorateDescRichLink(M.findDescRichLinkFromSelection(M.getDescRichSelection()), href);
      } else {
        var html = S.renderMarkdownLinkHtml(S.escapeHtml(href), href);
        if (!html) return false;
        try {
          document.execCommand('insertHTML', false, html);
        } catch (err2) {
          try {
            document.execCommand('insertText', false, href);
          } catch (err3) {
            return false;
          }
        }
      }
      M.syncDescSourceFromRich();
      M.scheduleDescSave();
      M.syncDescRichSize();
      M.syncDescFormatMenuSelection();
      M.onLayoutChange();
      return true;
    };
    M.applyDescMarkdownLink = function applyDescMarkdownLink(url) {
      var href = S.normalizePasteableMarkdownUrl(url) || S.safeMarkdownHref(url);
      if (!href) return false;
      var state = M.getDescEditState();
      var linked = S.linkMarkdownSelection(state, href);
      if (linked) {
        S.applyMarkdownEditToTextarea(M.descInput, linked);
      } else {
        var insertion = '[' + href + '](' + href + ')';
        S.applyMarkdownEditToTextarea(M.descInput, {
          value: state.value.slice(0, state.start) + insertion + state.value.slice(state.end),
          start: state.start + 1,
          end: state.start + 1 + href.length
        });
      }
      M.syncDescFormatMenuSelection();
      try {
        M.descInput.focus();
      } catch (e) {
        /* ignore */
      }
      return true;
    };
    M.promptDescLinkUrl = function promptDescLinkUrl() {
      var existing = '';
      if (M.descMode === 'rich') {
        var sel = M.getDescRichSelection();
        var anchor = M.findDescRichLinkFromSelection(sel);
        if (anchor) existing = S.richAttr(anchor, 'href') || '';
      }
      var next = window.prompt('URL du lien', existing || 'https://');
      if (next == null) return;
      var href = S.normalizePasteableMarkdownUrl(next) || S.safeMarkdownHref(String(next).trim());
      if (!href) return;
      if (M.descMode === 'rich') M.applyDescRichLink(href);
      else M.applyDescMarkdownLink(href);
    };
    M.applyDescRichBlock = function applyDescRichBlock(kind) {
      if (kind === 'ul') {
        M.execDescRichCommand('insertUnorderedList');
        return;
      }
      if (kind === 'ol') {
        M.execDescRichCommand('insertOrderedList');
        return;
      }
      if (kind === 'checklist') {
        M.execDescRichCommand('insertUnorderedList');
        var selection = global.getSelection && global.getSelection();
        var node = selection && selection.anchorNode;
        var li = node && (node.nodeType === 1 ? node : node.parentNode);
        while (li && li !== M.descRich && S.richNodeName(li) !== 'LI') li = li.parentNode;
        if (li && li !== M.descRich && !li.querySelector('input[type="checkbox"]')) {
          var checkbox = document.createElement('input');
          checkbox.type = 'checkbox';
          checkbox.setAttribute('contenteditable', 'false');
          li.insertBefore(checkbox, li.firstChild);
          li.insertBefore(document.createTextNode(' '), checkbox.nextSibling);
          li.classList.add('info-md-li--check');
        }
        M.syncDescSourceFromRich();
        M.scheduleDescSave();
        return;
      }
      M.execDescRichCommand('formatBlock', kind === 'normal' ? 'p' : kind);
    };
    M.focusDescEditor = function focusDescEditor(moveToEnd) {
      var target = M.descMode === 'rich' ? M.descRich : M.descInput;
      try {
        target.focus();
        if (moveToEnd && M.descMode === 'markdown') {
          var len = M.descInput.value.length;
          M.descInput.setSelectionRange(len, len);
        }
      } catch (e) {
        /* ignore */
      }
    };
    M.setDescMode = function setDescMode(mode, options) {
      options = options || {};
      var next = mode === 'markdown' ? 'markdown' : 'rich';
      if (M.descMode === 'rich' && next === 'markdown') M.syncDescSourceFromRich();
      M.descMode = next;
      if (M.descMode === 'rich') M.renderDescRich();
      M.descRich.hidden = M.descMode !== 'rich';
      M.descInput.hidden = M.descMode !== 'markdown';
      M.descRichModeBtn.classList.toggle('is-active', M.descMode === 'rich');
      M.descMarkdownModeBtn.classList.toggle('is-active', M.descMode === 'markdown');
      M.descRichModeBtn.setAttribute('aria-checked', M.descMode === 'rich' ? 'true' : 'false');
      M.descMarkdownModeBtn.setAttribute(
        'aria-checked',
        M.descMode === 'markdown' ? 'true' : 'false'
      );
      M.syncDescFormatMenuSelection();
      if (M.descMode === 'markdown') M.syncDescInputSize();
      else M.syncDescRichSize();
      if (options.focus !== false) M.focusDescEditor(false);
      M.onLayoutChange();
    };
    M.syncTitleInputSize = function syncTitleInputSize() {
      M.titleInput.style.overflowY = 'hidden';
      M.titleInput.style.height = 'auto';
      M.titleInput.style.height = M.titleInput.scrollHeight + 'px';
    };
    M.memberDisplayName = function memberDisplayName(member) {
      if (!member || typeof member !== 'object') return '';
      if (typeof member.fullName === 'string' && member.fullName.trim()) {
        return member.fullName.trim();
      }
      if (typeof member.username === 'string' && member.username.trim()) {
        return member.username.trim();
      }
      return '';
    };
    M.memberInitials = function memberInitials(member) {
      if (!member || typeof member !== 'object') return '?';
      if (typeof member.initials === 'string' && member.initials.trim()) {
        return member.initials.trim().slice(0, 3).toUpperCase();
      }
      var name = M.memberDisplayName(member);
      if (!name) return '?';
      var parts = name.split(/\s+/).filter(Boolean);
      if (parts.length >= 2) {
        return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
      }
      return name.slice(0, 2).toUpperCase();
    };
    M.memberAvatarUrl = function memberAvatarUrl(member) {
      if (!member || typeof member !== 'object') return '';
      // Power-Up client: ready-to-use 50px URL (t.member / card members).
      if (typeof member.avatar === 'string' && member.avatar.trim()) {
        return member.avatar.trim();
      }
      // REST API: avatarUrl is a prefix; append size unless already a .png.
      if (typeof member.avatarUrl === 'string' && member.avatarUrl.trim()) {
        var base = member.avatarUrl.trim().replace(/\/$/, '');
        if (/\.png($|\?)/i.test(base)) return base;
        return base + '/50.png';
      }
      if (
        member.id &&
        typeof member.avatarHash === 'string' &&
        member.avatarHash.trim()
      ) {
        return (
          'https://trello-members.s3.amazonaws.com/' +
          encodeURIComponent(String(member.id)) +
          '/' +
          encodeURIComponent(member.avatarHash.trim()) +
          '/50.png'
        );
      }
      return '';
    };
    M.enrichMemberAvatar = function enrichMemberAvatar(member) {
      if (!member || typeof member !== 'object') return member;
      if (M.memberAvatarUrl(member)) return member;
      if (!member.id || !M.boardMembers.length) return member;
      var id = String(member.id);
      for (var i = 0; i < M.boardMembers.length; i++) {
        var boardMember = M.boardMembers[i];
        if (!boardMember || String(boardMember.id) !== id) continue;
        if (!M.memberAvatarUrl(boardMember)) return member;
        return {
          id: member.id,
          fullName: member.fullName || boardMember.fullName || '',
          username: member.username || boardMember.username || '',
          initials: member.initials || boardMember.initials || '',
          avatar:
            typeof boardMember.avatar === 'string' ? boardMember.avatar : '',
          avatarUrl:
            typeof boardMember.avatarUrl === 'string'
              ? boardMember.avatarUrl
              : '',
          avatarHash:
            typeof boardMember.avatarHash === 'string'
              ? boardMember.avatarHash
              : ''
        };
      }
      return member;
    };
    M.appendMemberAvatar = function appendMemberAvatar(chip, member) {
      var resolved = M.enrichMemberAvatar(member);
      var avatarUrl = M.memberAvatarUrl(resolved);
      if (avatarUrl) {
        var img = document.createElement('img');
        img.className = 'info-member-avatar';
        img.src = avatarUrl;
        img.alt = '';
        img.referrerPolicy = 'no-referrer';
        img.width = 28;
        img.height = 28;
        img.loading = 'lazy';
        img.addEventListener('error', function () {
          img.remove();
          var fallback = document.createElement('span');
          fallback.className = 'info-member-initials';
          fallback.textContent = M.memberInitials(resolved);
          chip.insertBefore(fallback, chip.firstChild);
        });
        chip.appendChild(img);
        return;
      }
      var initials = document.createElement('span');
      initials.className = 'info-member-initials';
      initials.textContent = M.memberInitials(resolved);
      chip.appendChild(initials);
    };
    M.creatorDiffersFromAssignees = function creatorDiffersFromAssignees() {
      if (!M.creatorMember || !M.creatorMember.id) return false;
      if (
        M.members.length === 1 &&
        M.members[0] &&
        M.members[0].id &&
        String(M.members[0].id) === String(M.creatorMember.id)
      ) {
        return false;
      }
      return true;
    };
    M.renderCreator = function renderCreator() {
      M.creatorEl.replaceChildren();
      var show = M.creatorDiffersFromAssignees();
      M.creatorRow.row.hidden = !show;
      if (!show) return;

      var name = M.memberDisplayName(M.creatorMember) || 'Membre';
      var chip = document.createElement('span');
      chip.className = 'info-member';
      chip.title = name;
      chip.setAttribute('aria-label', name);
      M.appendMemberAvatar(chip, M.creatorMember);
      var nameEl = document.createElement('span');
      nameEl.className = 'info-member-name';
      nameEl.textContent = name;
      chip.appendChild(nameEl);
      M.creatorEl.appendChild(chip);
    };
    M.setMembersStatus = function setMembersStatus(text, kind) {
      M.applyInfoSaveStatus(M.membersStatus, text, kind);
    };
    M.displayAssignees = function displayAssignees() {
      return S.mergeAssigneesForDisplay(M.members, M.customAssignees, M.boardMembers);
    };
    M.selectedMemberIds = function selectedMemberIds() {
      var ids = Object.create(null);
      var all = M.displayAssignees();
      for (var i = 0; i < all.length; i++) {
        if (all[i] && all[i].id) ids[String(all[i].id)] = true;
      }
      return ids;
    };
    M.availableBoardMembers = function availableBoardMembers() {
      var selected = M.selectedMemberIds();
      // Also hide board members already represented only as a Trello assignee id.
      for (var i = 0; i < M.members.length; i++) {
        if (M.members[i] && M.members[i].id) selected[String(M.members[i].id)] = true;
      }
      var out = [];
      for (var b = 0; b < M.boardMembers.length; b++) {
        var member = M.boardMembers[b];
        if (!member || !member.id) continue;
        if (selected[String(member.id)]) continue;
        out.push(member);
      }
      return out;
    };
    M.availableCatalogAssignees = function availableCatalogAssignees() {
      var selected = M.selectedMemberIds();
      var out = [];
      var catalog = S.getCustomAssigneeCatalog();
      for (var i = 0; i < catalog.length; i++) {
        var entry = catalog[i];
        if (!entry || !entry.id) continue;
        if (selected[String(entry.id)]) continue;
        out.push(entry);
      }
      return out;
    };
    M.persistCustomAssigneeCatalog = function persistCustomAssigneeCatalog(nextList) {
      var previous = S.getCustomAssigneeCatalog();
      var list = S.normalizeCustomAssignees(nextList);
      S.setCustomAssigneeCatalog(list);
      if (!M.onCustomAssigneeCatalogChange) {
        return Promise.resolve({
          ok: true,
          changed: false,
          customAssigneeCatalog: list
        });
      }
      return Promise.resolve(M.onCustomAssigneeCatalogChange(list))
        .then(function (result) {
          if (result && result.ok === false) {
            S.setCustomAssigneeCatalog(previous);
            return result;
          }
          if (result && Array.isArray(result.customAssigneeCatalog)) {
            S.setCustomAssigneeCatalog(result.customAssigneeCatalog);
          }
          return (
            result || {
              ok: true,
              changed: true,
              customAssigneeCatalog: S.getCustomAssigneeCatalog()
            }
          );
        })
        .catch(function (err) {
          console.error('Info custom assignee catalog save failed', err);
          S.setCustomAssigneeCatalog(previous);
          return { ok: false };
        });
    };
    M.setMembersPickerOpen = function setMembersPickerOpen(open) {
      M.membersPickerOpen = !!open;
      M.membersPicker.hidden = !M.membersPickerOpen;
      M.membersAddBtn.setAttribute(
        'aria-expanded',
        M.membersPickerOpen ? 'true' : 'false'
      );
      M.membersAddWrap.classList.toggle('is-open', M.membersPickerOpen);
      if (M.membersPickerOpen) M.renderMembersPicker();
      M.onLayoutChange();
    };
    M.persistCustomAssignees = function persistCustomAssignees(nextList) {
      var list = S.normalizeCustomAssignees(nextList);
      M.customAssignees = list;
      if (!M.onCustomAssigneesChange) {
        M.renderMembers();
        M.onLayoutChange();
        return Promise.resolve({ ok: true, changed: false, customAssignees: list });
      }
      M.membersBusy = true;
      M.setMembersStatus('', 'saving');
      M.renderMembers();
      return Promise.resolve(M.onCustomAssigneesChange(list))
        .then(function (result) {
          M.membersBusy = false;
          if (result && result.ok === false) {
            M.setMembersStatus('\u00c9chec de l\u2019enregistrement', 'error');
            M.renderMembers();
            M.onLayoutChange();
            return result;
          }
          if (result && Array.isArray(result.customAssignees)) {
            M.customAssignees = S.normalizeCustomAssignees(result.customAssignees);
          }
          M.setMembersStatus('', 'ok');
          M.setMembersPickerOpen(false);
          M.renderMembers();
          setTimeout(function () {
            if (M.membersStatus.classList.contains('is-ok')) {
              M.setMembersStatus('');
            }
          }, 1400);
          M.onLayoutChange();
          return result || { ok: true, changed: true, customAssignees: list };
        })
        .catch(function (err) {
          M.membersBusy = false;
          console.error('Info custom assignee save failed', err);
          M.setMembersStatus('\u00c9chec de l\u2019enregistrement', 'error');
          M.renderMembers();
          M.onLayoutChange();
        });
    };
    M.setPlacesStatus = function setPlacesStatus(text, kind) {
      M.applyInfoSaveStatus(M.placesStatus, text, kind);
    };
    M.setPlacesPickerOpen = function setPlacesPickerOpen(target) {
      var next = String(target || '');
      if (next && !/^(at|from|ins:\d+|rep:\d+)$/.test(next)) next = '';
      // The click that follows releasing a pin must not dismiss what it opened.
      if (!next && Date.now() < M.pgIgnoreUntil) return;
      M.placesPickerSlot = next;
      if (next) M.placeEditKey = '';
      M.renderPlaces();
      M.onLayoutChange();
    };
    M.persistPlaceCatalog = function persistPlaceCatalog(nextList) {
      var previous = S.getPlaceCatalog();
      var list = S.normalizePlaceCatalog(nextList);
      S.setPlaceCatalog(list);
      if (!M.onPlaceCatalogChange) {
        return Promise.resolve({
          ok: true,
          changed: false,
          placeCatalog: list
        });
      }
      return Promise.resolve(M.onPlaceCatalogChange(list))
        .then(function (result) {
          if (result && result.ok === false) {
            S.setPlaceCatalog(previous);
            return result;
          }
          if (result && Array.isArray(result.placeCatalog)) {
            S.setPlaceCatalog(result.placeCatalog);
          }
          return (
            result || {
              ok: true,
              changed: true,
              placeCatalog: S.getPlaceCatalog()
            }
          );
        })
        .catch(function (err) {
          console.error('Info place catalog save failed', err);
          S.setPlaceCatalog(previous);
          return { ok: false };
        });
    };
    },
    run: function (M) {
    M.rowSummaries['task-types'] = function () {
      if (!M.taskTypes.length) return '';
      return M.irsFragment(
        M.irsCapped(M.taskTypes.map(M.irsTypeChip), M.IRS_MAX),
        M.taskTypes
          .map(function (id) {
            return S.taskTypeLabel(id) || id;
          })
          .join(', ')
      );
    };
    M.rowSummaries.labels = function () {
      if (!M.labels.length) return '';
      return M.irsFragment(
        M.irsCapped(M.labels.map(M.irsLabelChip), M.IRS_MAX + 1),
        M.labels.map(M.labelDisplayName).join(', ')
      );
    };
    M.rowSummaries.objectif = function () {
      var names = M.objectifCrumbNames();
      if (!names.length) return '';
      return M.irsFragment([M.irsObjectifNode(names)], names.join(' → '));
    };
    M.rowSummaries.parent = function () {
      if (!M.parentCards.length) return '';
      return M.irsFragment(
        M.irsCapped(
          M.parentCards.map(function (p) {
            return M.irsParentChip(p, M.parentCards.length === 1);
          }),
          2
        ),
        M.parentCards
          .map(function (p) {
            return p.name || 'Carte sans titre';
          })
          .join(', ')
      );
    };
    M.rowSummaries.desc = function () {
      var raw = M.descInput.value || '';
      var text = raw
        .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/^\s*(?:[-*+]|\d+[.)])\s+\[[ xX]\]\s*/gm, '')
        .replace(/^\s*(?:#{1,6}|>|[-*+]|\d+[.)])\s+/gm, '')
        .replace(/[*_`~]+/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (text.length > 160) text = text.slice(0, 159) + '…';

      var tasksTotal = 0;
      var tasksDone = 0;
      var taskRe = /^\s*(?:[-*+]|\d+[.)])\s+\[([ xX])\]/gm;
      var hit;
      while ((hit = taskRe.exec(raw))) {
        tasksTotal += 1;
        if (hit[1] !== ' ') tasksDone += 1;
      }
      var images = (raw.match(/!\[[^\]]*\]\([^)]*\)/g) || []).length;
      var links = Math.max(0, (raw.match(/\bhttps?:\/\/[^\s)\]]+/g) || []).length - images);

      if (!text && !tasksTotal && !images && !links) return '';
      var nodes = [];
      if (text) nodes.push(M.irsEl('span', 'irs-text', text));
      if (tasksTotal) {
        var allDone = tasksDone === tasksTotal;
        nodes.push(
          M.irsChip({
            className: 'irs-chip--tasks' + (allDone ? ' is-done' : ''),
            lead: M.irsIcon(allDone ? 'checks' : 'list-check'),
            text: tasksDone + '/' + tasksTotal,
            title: tasksDone + ' tâche(s) faite(s) sur ' + tasksTotal
          })
        );
      }
      if (links) {
        nodes.push(
          M.irsChip({
            className: 'irs-chip--links',
            lead: M.irsIcon('link'),
            text: String(links),
            title: links + (links > 1 ? ' liens' : ' lien')
          })
        );
      }
      if (images) {
        nodes.push(
          M.irsChip({
            className: 'irs-chip--images',
            lead: M.irsIcon('photo'),
            text: String(images),
            title: images + (images > 1 ? ' images' : ' image')
          })
        );
      }
      return M.irsFragment(nodes, text);
    };
    M.rowSummaries.members = function () {
      var display = M.displayAssignees();
      if (!display.length) return '';
      var compact = display.length > 2;
      var nodes = display.map(function (member) {
        var name = M.memberDisplayName(member) || 'Membre';
        var mid = member && member.id != null ? String(member.id) : '';
        var isCustom = !!(member && member.custom) || S.isCustomAssigneeId(mid);
        var roleIds = M.rolesForMember(mid);
        var roleLabels = [];
        var chip = M.irsChip({
          className: 'irs-member' + (isCustom ? ' is-custom' : ''),
          accent: M.irsHueColor(mid || name),
          lead: M.irsAvatar(member),
          text: compact ? name.split(/\s+/)[0] : name
        });
        roleIds.slice(0, 2).forEach(function (roleId) {
          var entry = S.getMemberRoleEntry(roleId);
          var roleLabel = (entry && entry.label) || roleId;
          roleLabels.push(roleLabel);
          var roleIcon = M.irsIcon((entry && entry.icon) || 'tag', 'irs-member-role');
          roleIcon.title = roleLabel;
          chip.appendChild(roleIcon);
        });
        chip.title = roleLabels.length ? name + ' — ' + roleLabels.join(', ') : name;
        return chip;
      });
      return M.irsFragment(
        M.irsCapped(nodes, M.IRS_MAX),
        display
          .map(function (member) {
            return M.memberDisplayName(member) || 'Membre';
          })
          .join(', ')
      );
    };
    M.rowSummaries.places = function () {
      var stops = M.pgStops(M.cardPlaces);
      if (!stops.length) return '';
      var shown = stops;
      var hidden = 0;
      if (stops.length > M.IRS_MAX) {
        shown = [stops[0], null, stops[stops.length - 1]];
        hidden = stops.length - 2;
      }
      var nodes = [];
      shown.forEach(function (stop, i) {
        if (i) nodes.push(M.irsIcon('arrow-narrow-right', 'irs-arrow'));
        if (!stop) {
          nodes.push(M.irsChip({ className: 'irs-chip--more', text: '+' + hidden }));
          return;
        }
        var name = M.placeDisplayName(stop.ref);
        nodes.push(
          M.irsChip({
            className: 'irs-place is-' + stop.key,
            accent: M.irsHueColor(stop.ref.id || name),
            lead: stop.key === 'at' ? M.irsIcon('map-pin') : M.irsEl('span', 'irs-stop-dot'),
            text: name,
            title: M.PLACE_STOP_LABELS[stop.key] + ' : ' + name
          })
        );
      });
      var acts = M.placeSeq(M.cardPlaces).filter(function (r) {
        return r.do;
      }).length;
      if (acts) {
        nodes.push(
          M.irsChip({
            className: 'irs-chip--actions',
            lead: M.irsIcon('list-check'),
            text: String(acts),
            title: acts + ' action' + (acts > 1 ? 's' : '')
          })
        );
      }
      return M.irsFragment(
        nodes,
        stops
          .map(function (stop) {
            return M.placeDisplayName(stop.ref);
          })
          .join(' → ')
      );
    };
    M.priorityInline = M.makeInlineMountRow(
      'priority',
      'Priorit\u00e9',
      'ti-flame'
    );
    M.progressInline = M.makeInlineMountRow(
      'progress',
      'Progr\u00e8s',
      'ti-progress'
    );
    M.dueInline = M.makeInlineMountRow(
      'due',
      '\u00c9ch\u00e9ance',
      'ti-calendar-event'
    );
    M.labelsRow = M.makeRow('labels', '\u00c9tiquettes', { icon: 'ti-tag' });
    M.labelsWrap = document.createElement('div');
    M.labelsWrap.className = 'info-labels-wrap';
    M.labelsEl = document.createElement('div');
    M.labelsEl.className = 'info-labels';
    M.labelsEl.setAttribute('aria-label', '\u00c9tiquettes de la carte');
    M.labelsAddWrap = document.createElement('div');
    M.labelsAddWrap.className = 'info-labels-add-wrap';
    M.labelsAddBtn = document.createElement('button');
    M.labelsAddBtn.type = 'button';
    M.labelsAddBtn.className = 'info-labels-add-btn';
    M.labelsAddBtn.setAttribute('aria-label', 'Ajouter une \u00e9tiquette');
    M.labelsAddBtn.title = 'Ajouter une \u00e9tiquette';
    M.labelsAddBtn.setAttribute('aria-expanded', 'false');
    M.labelsAddBtn.setAttribute('aria-haspopup', 'listbox');
    M.labelsAddBtn.innerHTML = '<i class="ti ti-plus" aria-hidden="true"></i>';
    M.labelsPicker = document.createElement('div');
    M.labelsPicker.className = 'info-labels-picker';
    M.labelsPicker.hidden = true;
    M.labelsPicker.setAttribute('role', 'listbox');
    M.labelsPicker.setAttribute('aria-label', '\u00c9tiquettes du tableau');
    M.labelsSearchInput = document.createElement('input');
    M.labelsSearchInput.type = 'search';
    M.labelsSearchInput.className = 'tp-input info-labels-search';
    M.labelsSearchInput.placeholder = 'Rechercher une \u00e9tiquette\u2026';
    M.labelsSearchInput.setAttribute('aria-label', 'Rechercher une \u00e9tiquette');
    M.labelsSearchInput.setAttribute('autocomplete', 'off');
    M.labelsPickerList = document.createElement('div');
    M.labelsPickerList.className = 'info-labels-picker-list';
    M.labelsPickerList.setAttribute('role', 'group');
    M.labelsPickerList.setAttribute('aria-label', '\u00c9tiquettes disponibles');
    M.labelsCreateBtn = document.createElement('button');
    M.labelsCreateBtn.type = 'button';
    M.labelsCreateBtn.className = 'info-labels-picker-create';
    M.labelsCreateBtn.hidden = true;
    M.labelsPicker.appendChild(M.labelsSearchInput);
    M.labelsPicker.appendChild(M.labelsPickerList);
    M.labelsPicker.appendChild(M.labelsCreateBtn);
    M.labelsStatus = document.createElement('span');
    M.labelsStatus.className = 'info-desc-status';
    M.labelsStatus.setAttribute('aria-live', 'polite');
    M.labelsSuggestSection = document.createElement('div');
    M.labelsSuggestSection.className = 'info-labels-suggestions';
    M.labelsSuggestSection.hidden = true;
    M.labelsSuggestSection.innerHTML =
      '<div class="info-labels-suggestions-head">' +
      '<button type="button" class="info-labels-suggestions-refresh" ' +
      'aria-label="Rafra\u00eechir les suggestions" title="Rafra\u00eechir">\u21bb</button>' +
      '</div>' +
      '<div class="info-labels-suggestions-list" role="list"></div>';
    M.labelsSuggestRefreshBtn = M.labelsSuggestSection.querySelector(
      '.info-labels-suggestions-refresh'
    );
    M.labelsSuggestListEl = M.labelsSuggestSection.querySelector(
      '.info-labels-suggestions-list'
    );
    M.labelsAddWrap.appendChild(M.labelsAddBtn);
    M.labelsAddWrap.appendChild(M.labelsPicker);
    M.labelsInline = document.createElement('div');
    M.labelsInline.className = 'info-labels-inline';
    M.labelsInline.appendChild(M.labelsEl);
    M.labelsInline.appendChild(M.labelsAddWrap);
    M.labelsColorPicker = document.createElement('div');
    M.labelsColorPicker.className = 'info-labels-color-picker';
    M.labelsColorPicker.hidden = true;
    M.labelsColorPicker.setAttribute('role', 'dialog');
    M.labelsColorPicker.setAttribute('aria-label', 'Modifier l\u2019\u00e9tiquette');
    M.labelsWrap.appendChild(M.labelsInline);
    M.labelsWrap.appendChild(M.labelsColorPicker);
    M.labelsWrap.appendChild(M.labelsStatus);
    M.labelsWrap.appendChild(M.labelsSuggestSection);
    M.labelsRow.value.appendChild(M.labelsWrap);
    M.taskTypesRow = M.makeRow('task-types', 'Type de t\u00e2che', {
      icon: 'ti-category',
    });
    M.taskTypesWrap = document.createElement('div');
    M.taskTypesWrap.className = 'info-task-types-wrap';
    M.taskTypesEl = document.createElement('div');
    M.taskTypesEl.className = 'info-task-types';
    M.taskTypesEl.setAttribute('aria-label', 'Types de t\u00e2che');
    M.taskTypesAddWrap = document.createElement('div');
    M.taskTypesAddWrap.className = 'info-task-types-add-wrap';
    M.taskTypesAddBtn = document.createElement('button');
    M.taskTypesAddBtn.type = 'button';
    M.taskTypesAddBtn.className = 'info-task-types-add-btn';
    M.taskTypesAddBtn.setAttribute('aria-label', 'Ajouter un type de t\u00e2che');
    M.taskTypesAddBtn.title = 'Ajouter un type de t\u00e2che';
    M.taskTypesAddBtn.setAttribute('aria-expanded', 'false');
    M.taskTypesAddBtn.setAttribute('aria-haspopup', 'listbox');
    M.taskTypesAddBtn.innerHTML = '<i class="ti ti-plus" aria-hidden="true"></i>';
    M.taskTypesPicker = document.createElement('div');
    M.taskTypesPicker.className = 'info-task-types-picker';
    M.taskTypesPicker.hidden = true;
    M.taskTypesPicker.setAttribute('role', 'listbox');
    M.taskTypesPicker.setAttribute('aria-label', 'Types de t\u00e2che disponibles');
    M.taskTypesPickerList = document.createElement('div');
    M.taskTypesPickerList.className = 'info-task-types-picker-list';
    M.taskTypesPickerList.setAttribute('role', 'group');
    M.taskTypesPickerList.setAttribute('aria-label', 'Types disponibles');
    M.taskTypesCreateWrap = document.createElement('div');
    M.taskTypesCreateWrap.className = 'info-task-types-create';
    M.taskTypesCreateWrap.hidden = !M.onCustomTaskTypesChange;
    M.taskTypesCreateRow = document.createElement('div');
    M.taskTypesCreateRow.className = 'info-task-types-create-row';
    M.taskTypesCreateIconWrap = document.createElement('div');
    M.taskTypesCreateIconWrap.className = 'info-task-types-create-icon-wrap';
    M.taskTypesCreateIconKey = S.randomTaskTypeIconKey();
    M.taskTypesIconPickerOpen = false;
    M.taskTypesCreateIconBtn = document.createElement('button');
    M.taskTypesCreateIconBtn.type = 'button';
    M.taskTypesCreateIconBtn.className = 'info-task-types-create-icon-trigger';
    M.taskTypesCreateIconBtn.title = 'Choisir une ic\u00f4ne';
    M.taskTypesCreateIconBtn.setAttribute('aria-label', 'Choisir une ic\u00f4ne');
    M.taskTypesCreateIconBtn.setAttribute('aria-expanded', 'false');
    M.taskTypesCreateIconBtn.setAttribute('aria-haspopup', 'listbox');
    M.taskTypesIconPicker = document.createElement('div');
    M.taskTypesIconPicker.className = 'info-task-types-icon-picker';
    M.taskTypesIconPicker.hidden = true;
    M.taskTypesIconPicker.setAttribute('role', 'listbox');
    M.taskTypesIconPicker.setAttribute('aria-label', 'Ic\u00f4nes disponibles');
    M.syncTaskTypesCreateIconBtn();
    M.taskTypesCreateInput = document.createElement('input');
    M.taskTypesCreateInput.type = 'search';
    M.taskTypesCreateInput.className = 'tp-input info-task-types-create-input';
    M.taskTypesCreateInput.placeholder = 'Rechercher ou cr\u00e9er\u2026';
    M.taskTypesCreateInput.setAttribute(
      'aria-label',
      'Rechercher ou cr\u00e9er un type de t\u00e2che'
    );
    M.taskTypesCreateInput.setAttribute('autocomplete', 'off');
    M.taskTypesCreateInput.maxLength = S.MAX_TASK_TYPE_LABEL_LEN;
    M.taskTypesCreateBtn = document.createElement('button');
    M.taskTypesCreateBtn.type = 'button';
    M.taskTypesCreateBtn.className = 'info-task-types-create-btn';
    M.taskTypesCreateBtn.textContent = 'Cr\u00e9er';
    M.taskTypesCreateBtn.title = 'Cr\u00e9er un type de t\u00e2che';
    M.taskTypesCreateBtn.disabled = true;
    M.taskTypesCreateIconWrap.appendChild(M.taskTypesCreateIconBtn);
    M.taskTypesCreateRow.appendChild(M.taskTypesCreateIconWrap);
    M.taskTypesCreateRow.appendChild(M.taskTypesCreateInput);
    M.taskTypesCreateRow.appendChild(M.taskTypesCreateBtn);
    M.taskTypesCreateWrap.appendChild(M.taskTypesCreateRow);
    M.taskTypesCreateWrap.appendChild(M.taskTypesIconPicker);
    M.taskTypesPicker.appendChild(M.taskTypesCreateWrap);
    M.taskTypesPicker.appendChild(M.taskTypesPickerList);
    M.taskTypesStatus = document.createElement('span');
    M.taskTypesStatus.className = 'info-desc-status';
    M.taskTypesStatus.setAttribute('aria-live', 'polite');
    M.taskTypesStatus.hidden = true;
    M.taskTypesAddWrap.appendChild(M.taskTypesAddBtn);
    M.taskTypesAddWrap.appendChild(M.taskTypesPicker);
    M.taskTypesSuggestSection = document.createElement('div');
    M.taskTypesSuggestSection.className = 'info-task-types-suggestions';
    M.taskTypesSuggestSection.hidden = true;
    M.taskTypesSuggestSection.innerHTML =
      '<div class="info-task-types-suggestions-list" role="list"></div>' +
      '<button type="button" class="info-task-types-suggestions-refresh" ' +
      'aria-label="Rafra\u00eechir les suggestions" title="Rafra\u00eechir">' +
      '<i class="ti ti-refresh" aria-hidden="true"></i></button>';
    M.taskTypesSuggestRefreshBtn = M.taskTypesSuggestSection.querySelector(
      '.info-task-types-suggestions-refresh'
    );
    M.taskTypesSuggestListEl = M.taskTypesSuggestSection.querySelector(
      '.info-task-types-suggestions-list'
    );
    M.taskTypesInline = document.createElement('div');
    M.taskTypesInline.className = 'info-task-types-inline';
    M.taskTypesInline.appendChild(M.taskTypesEl);
    M.taskTypesInline.appendChild(M.taskTypesSuggestSection);
    M.taskTypesInline.appendChild(M.taskTypesAddWrap);
    M.taskTypesWrap.appendChild(M.taskTypesInline);
    M.taskTypesWrap.appendChild(M.taskTypesStatus);
    M.taskTypesRow.value.appendChild(M.taskTypesWrap);
    M.parentRow = M.makeRow('parent', 'T\u00e2ches parentes', {
      icon: 'ti-hierarchy-3',
    });
    M.parentWrap = document.createElement('div');
    M.parentWrap.className = 'info-parent-wrap';
    M.parentInline = document.createElement('div');
    M.parentInline.className = 'info-parent-inline';
    M.parentChipsEl = document.createElement('div');
    M.parentChipsEl.className = 'info-parent-chips';
    M.parentPickWrap = document.createElement('div');
    M.parentPickWrap.className = 'info-parent-pick-wrap';
    M.parentPickBtn = document.createElement('button');
    M.parentPickBtn.type = 'button';
    M.parentPickBtn.className = 'info-parent-pick-btn';
    M.parentPickBtn.setAttribute('aria-label', 'Ajouter une t\u00e2che parente');
    M.parentPickBtn.title = 'Ajouter une t\u00e2che parente';
    M.parentPickBtn.setAttribute('aria-expanded', 'false');
    M.parentPickBtn.setAttribute('aria-haspopup', 'listbox');
    M.parentPickBtn.innerHTML = '<i class="ti ti-plus" aria-hidden="true"></i>';
    M.parentPicker = document.createElement('div');
    M.parentPicker.className = 'info-parent-picker';
    M.parentPicker.hidden = true;
    M.parentPicker.setAttribute('role', 'listbox');
    M.parentPicker.setAttribute('aria-label', 'Choisir une t\u00e2che parente');
    M.parentSearchInput = document.createElement('input');
    M.parentSearchInput.type = 'search';
    M.parentSearchInput.className = 'tp-input info-parent-search';
    M.parentSearchInput.placeholder = 'Rechercher une carte\u2026';
    M.parentSearchInput.setAttribute('aria-label', 'Rechercher une carte');
    M.parentStatus = document.createElement('p');
    M.parentStatus.className = 'info-parent-status';
    M.parentStatus.setAttribute('aria-live', 'polite');
    M.parentStatus.hidden = true;
    M.parentListEl = document.createElement('div');
    M.parentListEl.className = 'info-parent-list';
    M.parentListEl.setAttribute('role', 'list');
    M.parentPicker.appendChild(M.parentSearchInput);
    M.parentPicker.appendChild(M.parentStatus);
    M.parentPicker.appendChild(M.parentListEl);
    M.parentPickWrap.appendChild(M.parentPickBtn);
    M.parentPickWrap.appendChild(M.parentPicker);
    M.parentInline.appendChild(M.parentChipsEl);
    M.parentInline.appendChild(M.parentPickWrap);
    M.parentWrap.appendChild(M.parentInline);
    M.parentRow.value.appendChild(M.parentWrap);
    M.objectifRow = M.makeRow('objectif', 'Objectif', { icon: 'ti-hierarchy-2' });
    M.objectifMount = document.createElement('div');
    M.objectifMount.className = 'info-objectif-mount objectif-section-body';
    M.objectifMount.id = 'info-objectif-mount';
    M.objectifRow.row.classList.add('variant-objectif-section');
    M.objectifRow.row.hidden = true;
    M.objectifRow.value.appendChild(M.objectifMount);
    M.moreBody.appendChild(M.objectifRow.row);
    M.moreBody.appendChild(M.parentRow.row);
    M.moreBody.appendChild(M.taskTypesRow.row);
    M.moreBody.appendChild(M.labelsRow.row);
    M.moreBody.appendChild(M.historiqueMount);
    M.moreRow = M.makeRow('more-details', 'Plus de d\u00e9tails', {
      icon: 'ti-list-details',
    });
    M.moreRow.row.classList.add('info-row--more-details');
    M.moreWrap = document.createElement('div');
    M.moreWrap.className = 'info-more-details-wrap';
    M.moreToggle = document.createElement('button');
    M.moreToggle.type = 'button';
    M.moreToggle.className = 'info-more-details-toggle';
    M.moreToggle.setAttribute('aria-controls', M.moreBodyId);
    M.moreToggle.setAttribute('aria-expanded', 'false');
    M.moreChevron = document.createElement('i');
    M.moreChevron.className = 'ti ti-chevron-down info-more-details-chevron';
    M.moreChevron.setAttribute('aria-hidden', 'true');
    M.moreSummaryEl = document.createElement('span');
    M.moreSummaryEl.className = 'info-more-details-summary';
    M.moreToggle.appendChild(M.moreChevron);
    M.moreToggle.appendChild(M.moreSummaryEl);
    M.moreWrap.appendChild(M.moreToggle);
    M.moreWrap.appendChild(M.moreBody);
    M.moreRow.value.appendChild(M.moreWrap);
    M.body.appendChild(M.moreRow.row);
    M.field.appendChild(M.body);
    M.el.appendChild(M.field);
    M.pgIgnoreUntil = 0;
    M.pgExpanded = false;
    M.pgPickPoint = null;
    }
  });
})(typeof window !== 'undefined' ? window : this);
