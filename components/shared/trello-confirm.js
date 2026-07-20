/* Native Trello popups for confirm / multi-choice (falls back outside Power-Up). */
(function (global) {
  'use strict';

  /**
   * Trello's confirm `onCancel` is unreliable (Cancel often does nothing).
   * Prefer list popups so every action explicitly closes via `closePopup`.
   */

  function fallbackConfirm(message) {
    try {
      if (typeof global.confirm === 'function') return !!global.confirm(message);
    } catch (e) {
      /* ignore */
    }
    return true;
  }

  function closeTx(tx) {
    if (tx && typeof tx.closePopup === 'function') return tx.closePopup();
    return undefined;
  }

  /**
   * Multi-choice list popup.
   * @param {object|null} t
   * @param {{
   *   title?: string,
   *   actions: Array<{ id: string, text: string }>,
   *   mouseEvent?: Event
   * }} options
   * @returns {Promise<string|null>} action id, or null if dismissed / cancelled
   */
  function askActions(t, options) {
    options = options || {};
    var title =
      typeof options.title === 'string' && options.title
        ? options.title
        : 'Choisir';
    var actions = Array.isArray(options.actions) ? options.actions : [];

    if (!actions.length) return Promise.resolve(null);

    if (!(t && typeof t.popup === 'function')) {
      // Outside Power-Up: first action is the affirmative, rest ignored.
      var primary = actions[0];
      var ok = fallbackConfirm(title + '\n\n' + (primary && primary.text ? primary.text : 'OK') + ' ?');
      return Promise.resolve(ok && primary ? primary.id : null);
    }

    return new Promise(function (resolve) {
      var settled = false;
      function finish(id) {
        if (settled) return;
        settled = true;
        resolve(id == null ? null : String(id));
      }

      var items = actions.map(function (action) {
        var id = action && action.id != null ? String(action.id) : '';
        var text =
          action && typeof action.text === 'string' && action.text
            ? action.text
            : id || 'OK';
        return {
          text: text,
          callback: function (tx) {
            finish(id || null);
            return closeTx(tx);
          },
        };
      });

      var opts = {
        title: title,
        items: items,
      };
      if (options.mouseEvent) opts.mouseEvent = options.mouseEvent;

      try {
        var opened = t.popup(opts);
        if (opened && typeof opened.then === 'function') {
          opened.catch(function () {
            finish(null);
          });
        }
      } catch (err) {
        finish(null);
      }
    });
  }

  /**
   * @param {object|null} t — Trello iframe / Power-Up context
   * @param {{
   *   title?: string,
   *   message: string,
   *   confirmText?: string,
   *   cancelText?: string,
   *   confirmStyle?: 'primary'|'danger',
   *   mouseEvent?: Event
   * }} options
   * @returns {Promise<boolean>}
   */
  function ask(t, options) {
    options = options || {};
    var message =
      typeof options.message === 'string' && options.message
        ? options.message
        : 'Confirmer\u00a0?';
    var confirmText =
      typeof options.confirmText === 'string' && options.confirmText
        ? options.confirmText
        : 'OK';
    var cancelText =
      typeof options.cancelText === 'string' && options.cancelText
        ? options.cancelText
        : 'Annuler';

    // Prefer message as the list title (the question the user answers).
    return askActions(t, {
      title: message,
      mouseEvent: options.mouseEvent || null,
      actions: [
        { id: 'confirm', text: confirmText },
        { id: 'cancel', text: cancelText },
      ],
    }).then(function (id) {
      return id === 'confirm';
    });
  }

  global.TpConfirm = {
    ask: ask,
    askActions: askActions,
  };
})(typeof window !== 'undefined' ? window : this);
