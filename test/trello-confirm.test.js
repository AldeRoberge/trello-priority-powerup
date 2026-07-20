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
    assert.match(seen, /Supprimer \?/);
  });

  it('opens a list popup so Annuler can close reliably', async () => {
    let popupOpts = null;
    const t = {
      popup(opts) {
        popupOpts = opts;
        // Simulate user confirming via the first list item.
        setTimeout(function () {
          opts.items[0].callback({
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
    assert.ok(Array.isArray(popupOpts.items));
    assert.equal(popupOpts.items.length, 2);
    assert.equal(popupOpts.items[0].text, 'Supprimer');
    assert.equal(popupOpts.items[1].text, 'Annuler');
    assert.equal(popupOpts.title, 'Supprimer 2 tâches ?');
  });

  it('resolves false when the user picks Annuler', async () => {
    const t = {
      popup(opts) {
        setTimeout(function () {
          opts.items[1].callback({
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

  it('askActions returns the chosen action id and closes', async () => {
    let closed = false;
    const t = {
      popup(opts) {
        setTimeout(function () {
          opts.items[0].callback({
            closePopup() {
              closed = true;
              return Promise.resolve();
            },
          });
        }, 0);
        return Promise.resolve();
      },
    };
    const choice = await TpConfirm.askActions(t, {
      title: 'Supprimer « Test » ?',
      actions: [
        { id: 'done', text: 'Marquer comme terminé' },
        { id: 'delete', text: 'Supprimer' },
        { id: 'cancel', text: 'Annuler' },
      ],
    });
    assert.equal(choice, 'done');
    assert.equal(closed, true);
  });

  it('askActions Annuler returns cancel and closes', async () => {
    let closed = false;
    const t = {
      popup(opts) {
        setTimeout(function () {
          opts.items[2].callback({
            closePopup() {
              closed = true;
              return Promise.resolve();
            },
          });
        }, 0);
        return Promise.resolve();
      },
    };
    const choice = await TpConfirm.askActions(t, {
      title: 'Supprimer ?',
      actions: [
        { id: 'done', text: 'Marquer comme terminé' },
        { id: 'delete', text: 'Supprimer' },
        { id: 'cancel', text: 'Annuler' },
      ],
    });
    assert.equal(choice, 'cancel');
    assert.equal(closed, true);
  });
});
