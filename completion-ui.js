/* Completion popup UI — subtask list, difficulty, weighted progress. */
(function (global) {
  'use strict';

  function getCompletionTrello() {
    return global.CompletionTrello;
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function difficultyOptionsHtml(selected, CT) {
    var levels = CT && CT.DIFFICULTY_LEVELS ? CT.DIFFICULTY_LEVELS : [];
    return levels
      .map(function (level) {
        var sel = level.value === selected ? ' selected' : '';
        return (
          '<option value="' +
          level.value +
          '"' +
          sel +
          '>' +
          escapeHtml(level.label) +
          '</option>'
        );
      })
      .join('');
  }

  function mountCompletionUI(containerEl, options) {
    if (!containerEl) throw new Error('mountCompletionUI: container required');
    var CT = getCompletionTrello();
    if (!CT || typeof CT.normalizeCompletionData !== 'function') {
      throw new Error('CompletionTrello must be loaded before CompletionUI');
    }
    options = options || {};

    var data = CT.normalizeCompletionData(options.data || { items: [] });
    var onChange = typeof options.onChange === 'function' ? options.onChange : function () {};
    var onResize = typeof options.onResize === 'function' ? options.onResize : function () {};

    containerEl.innerHTML = '';
    containerEl.className = 'tp-completion';

    var header = document.createElement('header');
    header.className = 'tp-priority-card-header';
    var cardNameEl = document.createElement('p');
    cardNameEl.className = 'tp-priority-card-name is-loading';
    cardNameEl.id = 'cardName';
    cardNameEl.setAttribute('aria-live', 'polite');
    cardNameEl.textContent = 'Chargement\u2026';
    header.appendChild(cardNameEl);
    containerEl.appendChild(header);

    var progressSection = document.createElement('section');
    progressSection.className = 'tp-completion-progress';
    progressSection.setAttribute('aria-label', 'Progression');
    progressSection.innerHTML =
      '<div class="tp-completion-progress-head">' +
      '<span class="tp-completion-progress-label">Progression</span>' +
      '<span class="tp-completion-percent" id="completionPercent">0\u00a0%</span>' +
      '</div>' +
      '<div class="tp-completion-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">' +
      '<div class="tp-completion-bar-fill" id="completionBarFill"></div>' +
      '</div>' +
      '<p class="tp-completion-meta" id="completionMeta"></p>';
    containerEl.appendChild(progressSection);

    var listSection = document.createElement('section');
    listSection.className = 'tp-completion-list-section';
    listSection.innerHTML =
      '<h3 class="tp-heading">Sous-t\u00e2ches</h3>' +
      '<ul class="tp-completion-list" id="completionList" aria-label="Sous-t\u00e2ches"></ul>';
    containerEl.appendChild(listSection);

    var addSection = document.createElement('section');
    addSection.className = 'tp-completion-add';
    addSection.innerHTML =
      '<div class="tp-completion-add-row">' +
      '<input type="text" class="tp-input tp-completion-add-input" id="completionAddInput" ' +
      'placeholder="Ajouter une sous-t\u00e2che\u2026" maxlength="500" autocomplete="off" />' +
      '<button type="button" class="tp-btn tp-btn--primary tp-completion-add-btn" id="completionAddBtn">Ajouter</button>' +
      '</div>';
    containerEl.appendChild(addSection);

    var listEl = containerEl.querySelector('#completionList');
    var percentEl = containerEl.querySelector('#completionPercent');
    var barEl = containerEl.querySelector('.tp-completion-bar');
    var barFillEl = containerEl.querySelector('#completionBarFill');
    var metaEl = containerEl.querySelector('#completionMeta');
    var addInput = containerEl.querySelector('#completionAddInput');
    var addBtn = containerEl.querySelector('#completionAddBtn');

    function emitChange() {
      var prevIds = data.items.map(function (item) {
        return item.id;
      }).join('\0');
      data = CT.normalizeCompletionData(data);
      var nextIds = data.items.map(function (item) {
        return item.id;
      }).join('\0');
      if (prevIds !== nextIds) {
        renderList();
      }
      updateProgressUi();
      onChange(data);
    }

    function updateProgressUi() {
      var progress = CT.computeWeightedProgress(data.items);
      percentEl.textContent = progress.percent + '\u00a0%';
      barEl.setAttribute('aria-valuenow', String(progress.percent));
      barFillEl.style.width = progress.percent + '%';
      barEl.classList.toggle('is-complete', progress.percent === 100 && progress.hasItems);

      if (!progress.hasItems) {
        metaEl.textContent = 'Aucune sous-t\u00e2che \u2014 ajoutez des \u00e9l\u00e9ments pour suivre l\u2019avancement.';
      } else {
        metaEl.textContent =
          progress.doneCount +
          ' sur ' +
          progress.totalCount +
          ' termin\u00e9e' +
          (progress.doneCount > 1 ? 's' : '') +
          ' \u00b7 pond\u00e9ration ' +
          progress.doneWeight +
          '/' +
          progress.totalWeight;
      }
    }

    function bindItemRow(li, item) {
      var checkbox = li.querySelector('.tp-completion-check');
      var textInput = li.querySelector('.tp-completion-text');
      var diffSelect = li.querySelector('.tp-completion-diff');
      var deleteBtn = li.querySelector('.tp-completion-delete');

      checkbox.addEventListener('change', function () {
        item.done = checkbox.checked;
        li.classList.toggle('is-done', item.done);
        emitChange();
      });

      textInput.addEventListener('change', function () {
        var trimmed = textInput.value.trim();
        if (!trimmed) {
          removeItem(item.id);
          return;
        }
        item.text = trimmed;
        emitChange();
      });

      textInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          textInput.blur();
        }
      });

      diffSelect.addEventListener('change', function () {
        item.difficulty = Number(diffSelect.value);
        emitChange();
      });

      deleteBtn.addEventListener('click', function () {
        removeItem(item.id);
      });
    }

    function renderItem(item) {
      var li = document.createElement('li');
      li.className = 'tp-completion-item' + (item.done ? ' is-done' : '');
      li.dataset.id = item.id;

      var checkWrap = document.createElement('label');
      checkWrap.className = 'tp-completion-check-wrap';
      var checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'tp-completion-check';
      checkbox.checked = item.done;
      checkbox.setAttribute('aria-label', 'Marquer comme termin\u00e9');
      checkWrap.appendChild(checkbox);

      var textInput = document.createElement('input');
      textInput.type = 'text';
      textInput.className = 'tp-input tp-completion-text';
      textInput.value = item.text;
      textInput.setAttribute('aria-label', 'Texte de la sous-t\u00e2che');

      var diffSelect = document.createElement('select');
      diffSelect.className = 'tp-input tp-completion-diff';
      diffSelect.setAttribute('aria-label', 'Difficult\u00e9');
      diffSelect.title = 'Difficult\u00e9';
      diffSelect.innerHTML = difficultyOptionsHtml(item.difficulty, CT);

      var deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'tp-completion-delete';
      deleteBtn.setAttribute('aria-label', 'Supprimer');
      deleteBtn.title = 'Supprimer';
      deleteBtn.textContent = '\u00d7';

      li.appendChild(checkWrap);
      li.appendChild(textInput);
      li.appendChild(diffSelect);
      li.appendChild(deleteBtn);
      bindItemRow(li, item);
      return li;
    }

    function renderList() {
      listEl.replaceChildren();
      if (!data.items.length) {
        var empty = document.createElement('li');
        empty.className = 'tp-completion-empty';
        empty.textContent = 'Aucune sous-t\u00e2che pour l\u2019instant.';
        listEl.appendChild(empty);
        return;
      }
      data.items.forEach(function (item) {
        listEl.appendChild(renderItem(item));
      });
    }

    function removeItem(id) {
      data.items = data.items.filter(function (item) {
        return item.id !== id;
      });
      renderList();
      updateProgressUi();
      emitChange();
      onResize();
    }

    function addItem(text, difficulty) {
      var trimmed = (text || '').trim();
      if (!trimmed) return false;
      var item = CT.normalizeItem({
        id: CT.generateId(),
        text: trimmed,
        done: false,
        difficulty: difficulty != null ? difficulty : 2,
      });
      if (!item) return false;
      data.items.push(item);
      renderList();
      updateProgressUi();
      emitChange();
      onResize();
      return true;
    }

    function addFromInput() {
      var ok = addItem(addInput.value, 2);
      if (ok) {
        addInput.value = '';
        addInput.focus();
      }
    }

    addBtn.addEventListener('click', addFromInput);
    addInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        addFromInput();
      }
    });

    renderList();
    updateProgressUi();

    return {
      setCardName: function (name) {
        var label = name || 'Carte';
        cardNameEl.textContent = label;
        cardNameEl.title = name ? name : '';
        cardNameEl.classList.remove('is-loading');
        onResize();
      },
      getData: function () {
        return CT.normalizeCompletionData(data);
      },
      setData: function (next) {
        data = CT.normalizeCompletionData(next);
        renderList();
        updateProgressUi();
        onResize();
      },
      addItem: addItem,
      focusAddInput: function () {
        addInput.focus();
      },
    };
  }

  global.CompletionUI = {
    mountCompletionUI: mountCompletionUI,
  };
})(typeof window !== 'undefined' ? window : this);
