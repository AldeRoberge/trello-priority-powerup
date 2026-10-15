/*
 * Role: the "Nouvelle carte" row that closes every list of cards (Tableau, Gantt). One input, a dimmed
 * placeholder, Enter creates, Escape leaves. Kanban and Dashboard keep a column-scoped button that
 * shares the same wording (AddRow.LABEL) and the same quiet look (add-row.css).
 *
 *   AddRow.input({ id, onSubmit(title, input) })   -> <input class="ar-input">
 *
 * The caller owns the busy state and the refocus after creating, because the list re-renders.
 */
(function (global) {
  'use strict';

  var LABEL = 'Nouvelle carte';

  /** What gets created: one line, no stray spaces. '' means nothing to create. */
  function cleanTitle(value) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  }

  function input(o) {
    o = o || {};
    var el = document.createElement('input');
    el.type = 'text';
    el.className = 'ar-input' + (o.className ? ' ' + o.className : '');
    el.placeholder = o.placeholder || LABEL + '…';
    el.autocomplete = 'off';
    el.setAttribute('aria-label', LABEL);
    if (o.id) el.id = o.id;
    el.addEventListener('keydown', function (e) {
      e.stopPropagation();
      if (e.key === 'Enter' && !e.isComposing) {
        e.preventDefault();
        var title = cleanTitle(el.value);
        if (title && typeof o.onSubmit === 'function') o.onSubmit(title, el);
      } else if (e.key === 'Escape') {
        el.value = '';
        el.blur();
      }
    });
    return el;
  }

  global.AddRow = { LABEL: LABEL, cleanTitle: cleanTitle, input: input };
})(typeof window !== 'undefined' ? window : this);
