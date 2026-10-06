'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent } = require('./helpers/load');

loadComponent('shared/quick-parse.js');
const QP = global.QuickParse;
const WED = new Date(2026, 9, 7); // Wednesday 2026-10-07

describe('QuickParse', () => {
  it('leaves plain titles untouched', () => {
    assert.deepEqual(QP.parse('Appeler le plombier', WED), { name: 'Appeler le plombier', dueDate: '' });
  });
  it('reads demain, après-demain and aujourd\'hui', () => {
    assert.deepEqual(QP.parse('Appeler le plombier demain', WED), { name: 'Appeler le plombier', dueDate: '2026-10-08' });
    assert.equal(QP.parse('Rapport après-demain', WED).dueDate, '2026-10-09');
    assert.equal(QP.parse('Rapport pour aujourd’hui', WED).dueDate, '2026-10-07');
  });
  it('reads weekdays, today counting as today unless "prochain"', () => {
    assert.equal(QP.parse('Rapport vendredi', WED).dueDate, '2026-10-09');
    assert.equal(QP.parse('Rapport mercredi', WED).dueDate, '2026-10-07');
    assert.equal(QP.parse('Rapport mercredi prochain', WED).dueDate, '2026-10-14');
    assert.equal(QP.parse('Rapport lundi', WED).name, 'Rapport');
  });
  it('reads relative offsets and calendar dates', () => {
    assert.equal(QP.parse('Facture dans 3 jours', WED).dueDate, '2026-10-10');
    assert.equal(QP.parse('Facture dans 2 semaines', WED).dueDate, '2026-10-21');
    assert.equal(QP.parse('Bilan le 15 octobre', WED).dueDate, '2026-10-15');
    assert.equal(QP.parse('Bilan le 3 septembre', WED).dueDate, '2027-09-03');
    assert.equal(QP.parse('Bilan 2026-11-02', WED).dueDate, '2026-11-02');
  });
  it('never empties the title nor takes a mid-sentence date', () => {
    assert.deepEqual(QP.parse('demain', WED), { name: 'demain', dueDate: '' });
    assert.equal(QP.parse('Lundi matin appeler Paul', WED).dueDate, '');
    assert.equal(QP.parse('Bilan le 31 février', WED).dueDate, '');
  });
});

describe('TableModel.plainMarkdown', () => {
  it('flattens Markdown to a single readable line', () => {
    loadComponent('table/table-model.js');
    assert.equal(
      global.TableModel.plainMarkdown('Inviter **tout le monde**\n- ordre du jour\n- [ ] salle\n[lien](http://x) snake_case'),
      'Inviter tout le monde · ordre du jour · salle · lien snake_case'
    );
  });
});
