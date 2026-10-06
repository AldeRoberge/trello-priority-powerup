'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { parseWhen } = require('../components/shared/quick-parse.js');

const NOW = new Date(2026, 9, 6); // 6 octobre 2026

describe('QuickParse.parseWhen', () => {
  const cases = [
    ['15 octobre 2023', '2023-10-15', 'jour'],
    ['le 1er mai 2020', '2020-05-01', 'jour'],
    ['2023-04-09', '2023-04-09', 'jour'],
    ['hier', '2026-10-05', 'jour'],
    ['octobre 2023', '2023-10-01', 'mois'],
    ['en 2022', '2022-01-01', 'année'],
    ["l'an dernier", '2025-01-01', 'année'],
    ['il y a 2 ans', '2024-10-06', 'approx'],
    ['il y a quelques années', '2023-10-06', 'approx'],
    ['il y a trois mois', '2026-07-06', 'approx'],
    ['il y a 10 jours', '2026-09-26', 'jour'],
    ['vers 2019', '2019-01-01', 'approx'],
    ['cet été', '2026-06-01', 'approx'],
  ];
  cases.forEach(([text, iso, precision]) => {
    it(`reads "${text}"`, () => {
      const w = parseWhen(text, NOW);
      assert.ok(w, text);
      assert.equal(w.iso, iso);
      assert.equal(w.precision, precision);
    });
  });

  it('a date without year is the last one that happened', () => {
    assert.equal(parseWhen('3 mars', NOW).iso, '2026-03-03');
    assert.equal(parseWhen('25 décembre', NOW).iso, '2025-12-25');
  });

  it('labels show the precision', () => {
    assert.equal(parseWhen('octobre 2023', NOW).label, 'octobre 2023');
    assert.equal(parseWhen('il y a 2 ans', NOW).label, 'vers 2024');
  });

  it('refuses what is not a date', () => {
    assert.equal(parseWhen('bientôt peut-être', NOW), null);
    assert.equal(parseWhen('', NOW), null);
    assert.equal(parseWhen('31 février 2020', NOW), null);
  });
});
