/* Native Trello confirm popup (falls back to window.confirm outside Power-Up). */
(function (global) {
  'use strict';

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
    var title =
      typeof options.title === 'string' && options.title
        ? options.title
        : 'Confirmer';
    var confirmText =
      typeof options.confirmText === 'string' && options.confirmText
        ? options.confirmText
        : 'OK';
    var cancelText =
      typeof options.cancelText === 'string' && options.cancelText
        ? options.cancelText
        : 'Annuler';
    var confirmStyle =
      options.confirmStyle === 'primary' ? 'primary' : 'danger';

    if (t && typeof t.popup === 'function') {
      return new Promise(function (resolve) {
        var settled = false;
        function finish(ok) {
          if (settled) return;
          settled = true;
          resolve(!!ok);
        }
        var opts = {
          type: 'confirm',
          title: title,
          message: message,
          confirmText: confirmText,
          confirmStyle: confirmStyle,
          cancelText: cancelText,
          onConfirm: function (tx) {
            finish(true);
            return tx && typeof tx.closePopup === 'function'
              ? tx.closePopup()
              : undefined;
          },
          onCancel: function (tx) {
            finish(false);
            return tx && typeof tx.closePopup === 'function'
              ? tx.closePopup()
              : undefined;
          },
        };
        if (options.mouseEvent) opts.mouseEvent = options.mouseEvent;
        try {
          var opened = t.popup(opts);
          if (opened && typeof opened.then === 'function') {
            opened.catch(function () {
              finish(fallbackConfirm(message));
            });
          }
        } catch (err) {
          finish(fallbackConfirm(message));
        }
      });
    }

    return Promise.resolve(fallbackConfirm(message));
  }

  function fallbackConfirm(message) {
    try {
      if (typeof global.confirm === 'function') return !!global.confirm(message);
    } catch (e) {
      /* ignore */
    }
    return true;
  }

  global.TpConfirm = {
    ask: ask,
  };
})(typeof window !== 'undefined' ? window : this);
