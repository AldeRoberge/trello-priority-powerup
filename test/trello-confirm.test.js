'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent } = require('./helpers/load');

describe('TpConfirm', () => {
  let TpConfirm;

  before(() => {
    loadComponent('shared/trello-confirm.js');
    TpConfirm = global.TpConfirm;
    assert.ok(TpConfirm);
  });

  it('falls back to window.confirm when t.popup is unavailable', async () => {
    let seen = '';
    global.confirm = (msg) => {
      seen = msg;
      return false;
    };
    const ok = await TpConfirm.ask(null, { message: 'Supprimer ?' });
    assert.equal(ok, false);
    assert.equal(seen, 'Supprimer ?');
  });

  it('opens a native confirm popup when t.popup exists', async () => {
    let popupOpts = null;
    const t = {
      popup(opts) {
        popupOpts = opts;
        // Simulate user confirming.
        setTimeout(function () {
          opts.onConfirm({
            closePopup() {
              return Promise.resolve();
            },
          });
        }, 0);
        return Promise.resolve();
      },
    };
    const ok = await TpConfirm.ask(t, {
      title: 'Supprimer',
      message: 'Supprimer 2 tâches ?',
      confirmText: 'Supprimer',
      confirmStyle: 'danger',
    });
    assert.equal(ok, true);
    assert.equal(popupOpts.type, 'confirm');
    assert.equal(popupOpts.title, 'Supprimer');
    assert.equal(popupOpts.message, 'Supprimer 2 tâches ?');
    assert.equal(popupOpts.confirmStyle, 'danger');
  });

  it('resolves false when the user cancels the native popup', async () => {
    const t = {
      popup(opts) {
        setTimeout(function () {
          opts.onCancel({
            closePopup() {
              return Promise.resolve();
            },
          });
        }, 0);
        return Promise.resolve();
      },
    };
    const ok = await TpConfirm.ask(t, { message: 'Supprimer ?' });
    assert.equal(ok, false);
  });
});
