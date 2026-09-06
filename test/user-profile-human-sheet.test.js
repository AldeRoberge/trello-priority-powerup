'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent, clearComponentCache } = require('./helpers/load');

describe('UserProfile human sheet helpers', () => {
  let UserProfile;

  beforeEach(() => {
    clearComponentCache();
    delete global.UserProfile;
    UserProfile = loadComponent('profile/user-profile.js').UserProfile;
  });

  it('isHumanSheetText recognizes Moi / État prefixes', () => {
    assert.equal(UserProfile.isHumanSheetText('Moi — Identité: Alex'), true);
    assert.equal(UserProfile.isHumanSheetText('État — énergie: drained'), true);
    assert.equal(UserProfile.isHumanSheetText('Etat - grit: low'), true);
    assert.equal(UserProfile.isHumanSheetText('Le service finances valide'), false);
    assert.equal(UserProfile.isHumanSheetText(''), false);
  });

  it('humanSheetFromMemory splits durable vs state', () => {
    const sheet = UserProfile.humanSheetFromMemory({
      longTerm: {
        facts: [
          { text: 'Moi — Identité: né 1990' },
          { text: 'Le boss valide les achats' },
          { text: 'Moi — Compétence: piano (intermédiaire)' }
        ]
      },
      shortTerm: {
        notes: [
          { text: 'État — énergie mentale: foggy (2026-09-06)' },
          { text: 'note provisoire sans préfixe' }
        ]
      }
    });
    assert.deepEqual(sheet.durable, [
      'Moi — Identité: né 1990',
      'Moi — Compétence: piano (intermédiaire)'
    ]);
    assert.deepEqual(sheet.state, ['État — énergie mentale: foggy (2026-09-06)']);
  });
});
