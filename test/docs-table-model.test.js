'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent } = require('./helpers/load');

describe('DocsTableModel', () => {
  let T;
  before(() => {
    loadComponent('docs/docs-table-model.js');
    T = global.DocsTableModel;
  });

  const grid = (rows) => T.fromGrid(rows);
  const texts = (m) => T.gridOf(m);

  it('names columns and parses references', () => {
    assert.equal(T.colName(0), 'A');
    assert.equal(T.colName(25), 'Z');
    assert.equal(T.colName(26), 'AA');
    assert.equal(T.colIndex('AB'), 27);
    assert.deepEqual(T.parseRef('$B$3'), { r: 2, c: 1 });
    assert.equal(T.parseRef('B0'), null);
  });

  it('parses and formats numbers the Québec way', () => {
    assert.equal(T.parseNumber('12,5'), 12.5);
    assert.equal(T.parseNumber('1 234,56'), 1234.56);
    assert.equal(T.parseNumber('1,234.50'), 1234.5);
    assert.equal(T.parseNumber('1.234,5'), 1234.5);
    assert.equal(T.parseNumber('$1,234.50'), 1234.5);
    assert.equal(T.parseNumber('12 %'), 0.12);
    assert.equal(T.parseNumber('-3'), -3);
    assert.equal(T.parseNumber('abc'), null);
    assert.equal(T.parseNumber('1e5'), null);
    assert.equal(T.parseNumber(''), null);
    assert.equal(T.parseNumber('-'), null);
    assert.equal(T.formatNumber(0.1 + 0.2, 'auto'), '0,3');
    assert.equal(T.formatNumber(1234.5, 'num'), '1 234,50');
    assert.equal(T.formatNumber(1234.5, 'cur'), '1 234,50 $');
    assert.equal(T.formatNumber(0.125, 'pct'), '12,5 %');
    assert.equal(T.formatNumber(-1234.5, 'num'), '-1 234,50');
  });

  it('evaluates formulas, ranges and French function names', () => {
    const m = grid([['a', 'b'], ['1', '2'], ['3', '4'], ['', '']]);
    T.setInput(m.rows[3][0], '=SUM(A2:A3)');
    T.setInput(m.rows[3][1], '=MOYENNE(B2:B3)*2');
    T.recalc(m);
    assert.equal(m.rows[3][0].t, '4');
    assert.equal(m.rows[3][1].t, '6');
    T.setInput(m.rows[1][0], '=IF(A3>2,"grand","petit")&"!"');
    T.recalc(m);
    assert.equal(m.rows[1][0].t, 'grand!');
    T.setInput(m.rows[1][0], '=2+3*4^2-(1+1)');
    T.recalc(m);
    assert.equal(m.rows[1][0].t, '48');
    T.setInput(m.rows[1][0], '=50%');
    T.recalc(m);
    assert.equal(m.rows[1][0].t, '0,5');
  });

  it('reports errors instead of throwing', () => {
    const m = grid([['a'], ['1'], ['']]);
    const set = (r, f) => { T.setInput(m.rows[r][0], f); T.recalc(m); return m.rows[r][0].t; };
    assert.equal(set(2, '=A2/0'), '#DIV/0!');
    assert.equal(set(2, '=FOO(1)'), '#NAME?');
    assert.equal(set(2, '=1+'), '#ERR');
    assert.equal(set(2, '=A3'), '#CYCLE');
    assert.equal(set(2, '=A1+1'), '#VALUE!');
    assert.equal(set(2, '=SQRT(-1)'), '#NUM!');
    assert.equal(set(2, '=AVERAGE(Z9:Z10)'), '#DIV/0!');
  });

  it('chains formulas and detects cycles between cells', () => {
    const m = grid([['a'], ['1'], ['=A2+1'], ['=A3+1']]);
    m.rows[2][0].f = '=A2+1'; m.rows[2][0].t = '';
    m.rows[3][0].f = '=A3+1'; m.rows[3][0].t = '';
    T.recalc(m);
    assert.equal(m.rows[3][0].t, '3');
    m.rows[1][0] = { t: '', f: '=A4' };
    T.recalc(m);
    assert.equal(m.rows[3][0].t, '#CYCLE');
  });

  it('applies a number format to a formula result', () => {
    const m = grid([['a'], ['0,25'], ['']]);
    T.setInput(m.rows[2][0], '=A2*2');
    m.rows[2][0].fmt = 'pct';
    T.recalc(m);
    assert.equal(m.rows[2][0].t, '50 %');
  });

  it('inserts and deletes rows and columns and keeps formulas pointing at the same data', () => {
    const m = grid([['a', 'b'], ['1', '2'], ['3', '4'], ['', '']]);
    T.setInput(m.rows[3][0], '=SUM(A2:A3)');
    assert.ok(T.insertRow(m, 2));
    assert.equal(m.rows[4][0].f, '=SUM(A2:A4)');
    assert.ok(T.deleteRow(m, 2));
    assert.equal(m.rows[3][0].f, '=SUM(A2:A3)');
    assert.ok(T.insertCol(m, 0));
    assert.equal(m.rows[3][1].f, '=SUM(B2:B3)');
    assert.ok(T.deleteCol(m, 0));
    assert.equal(m.rows[3][0].f, '=SUM(A2:A3)');
    // deleting a cell that a formula points at gives #REF!
    T.setInput(m.rows[1][1], '=A3');
    assert.ok(T.deleteRow(m, 2));
    assert.equal(m.rows[1][1].f, '=#REF!');
    T.recalc(m);
    assert.equal(m.rows[1][1].t, '#ERR');
  });

  it('refuses to delete the header or the last row and column', () => {
    const m = grid([['a'], ['1']]);
    assert.equal(T.deleteRow(m, 0), false);
    assert.equal(T.deleteRow(m, 1), false);
    assert.equal(T.deleteCol(m, 0), false);
    assert.equal(T.insertRow(m, 0), true);
    assert.equal(m.rows[0][0].t, 'a');
  });

  it('moves columns and rows together with formulas, alignment and rules', () => {
    const m = grid([['a', 'b', 'c'], ['1', '2', ''], ['3', '4', '']]);
    T.setAlign(m, 0, 'right');
    m.cf.push({ c: 2, op: 'gt', v: '1', bg: 'red', fg: '', row: false });
    T.setInput(m.rows[1][2], '=A2+B2');
    assert.ok(T.moveCol(m, 0, 2));
    assert.deepEqual(texts(m)[0], ['b', 'c', 'a']);
    assert.deepEqual(m.al, ['', '', 'right']);
    assert.equal(m.cf[0].c, 1);
    assert.equal(m.rows[1][1].f, '=C2+A2');
    T.recalc(m);
    assert.equal(m.rows[1][1].t, '3');
    assert.ok(T.moveRow(m, 1, 2));
    assert.equal(m.rows[2][1].f, '=C3+A3');
    assert.equal(T.moveRow(m, 0, 1), false);
  });

  it('duplicates a row with shifted references', () => {
    const m = grid([['a', 'b'], ['1', ''], ['3', '']]);
    T.setInput(m.rows[1][1], '=A2*2');
    assert.ok(T.duplicateRow(m, 1));
    assert.equal(m.rows[2][1].f, '=A3*2');
    assert.equal(m.rows[2][0].t, '1');
  });

  it('sorts numbers and text, blanks last, and keeps totals rows in place', () => {
    const m = grid([['n', 'x'], ['10', ''], ['2', ''], ['', ''], ['b', ''], ['a', ''], ['', '']]);
    T.setInput(m.rows[6][0], '=SUM(A2:A3)');
    T.setInput(m.rows[1][1], '=A2*2');
    assert.ok(T.sortRows(m, 0, 'asc'));
    assert.deepEqual(texts(m).map((r) => r[0]).slice(0, 6), ['n', '2', '10', 'a', 'b', '']);
    // the formula that used its own row follows it
    assert.equal(m.rows[2][1].f, '=A3*2');
    assert.equal(m.rows[6][0].f, '=SUM(A2:A3)');
    assert.ok(T.sortRows(m, 0, 'desc'));
    assert.equal(m.rows[1][0].t, 'b');
    assert.equal(T.sortRows(m, 0, 'desc'), false);
  });

  it('sets colors, formats and clears', () => {
    const m = grid([['a', 'b'], ['12', 'x']]);
    T.setColor(m, T.rect(0, 0, 1, 0), 'bg', 'red');
    assert.equal(m.rows[1][0].bg, 'red');
    T.setColor(m, T.rect(1, 0, 1, 0), 'bg', 'nope');
    assert.equal(m.rows[1][0].bg, undefined);
    T.setFormat(m, T.rect(1, 0, 1, 0), 'pct');
    assert.equal(m.rows[1][0].t, '12 %');
    T.setFormat(m, T.rect(1, 0, 1, 0), 'auto');
    assert.equal(m.rows[1][0].fmt, undefined);
    T.clearCells(m, T.rect(1, 0, 1, 1));
    assert.deepEqual(texts(m)[1], ['', '']);
    T.clearFormat(m, T.rect(0, 0, 0, 0));
    assert.equal(m.rows[0][0].bg, undefined);
  });

  it('auto-sums the selection below it and adds a row when needed', () => {
    const m = grid([['a', 'b'], ['1', '5'], ['2', '6']]);
    const at = T.autoSum(m, T.rect(0, 0, 2, 0), 'SUM');
    assert.deepEqual(at, { r: 3, c: 0 });
    assert.equal(m.rows[3][0].f, '=SUM(A2:A3)');
    T.recalc(m);
    assert.equal(m.rows[3][0].t, '3');
    const m2 = grid([['a', 'b'], ['1', '5']]);
    const at2 = T.autoSum(m2, T.rect(1, 0, 1, 1), 'AVERAGE');
    assert.deepEqual(at2, { r: 1, c: 2 });
    assert.equal(T.width(m2), 3);
    T.recalc(m2);
    assert.equal(m2.rows[1][2].t, '3');
  });

  it('matches conditional formatting rules', () => {
    const m = grid([['n', 'name'], ['5', 'Ana'], ['20', 'Bob'], ['', 'Cy']]);
    m.cf = [
      T.cleanRule({ c: 0, op: 'gt', v: '10', bg: 'red' }),
      T.cleanRule({ c: 1, op: 'has', v: 'an', fg: 'blue', row: true }),
      T.cleanRule({ c: -1, op: 'empty', bg: 'gray' }),
      T.cleanRule({ c: 0, op: 'bogus' }),
    ].filter(Boolean);
    assert.equal(m.cf.length, 3);
    assert.equal(T.cfStyle(m, 0, 0), null);
    assert.deepEqual(T.cfStyle(m, 2, 0), { bg: 'red' });
    assert.deepEqual(T.cfStyle(m, 1, 0), { fg: 'blue' });
    assert.deepEqual(T.cfStyle(m, 1, 1), { fg: 'blue' });
    assert.deepEqual(T.cfStyle(m, 3, 0), { bg: 'gray' });
    assert.equal(T.cfMatch({ op: 'gt', v: 'abc' }, '5'), false);
    assert.equal(T.cfMatch({ op: 'eq', v: 'ana' }, 'Ana'), true);
    assert.equal(T.cleanRule({ c: 1, op: 'eq', v: 'x', bg: 'pink-not' }).bg, '');
  });

  it('round-trips CSV and TSV with quotes, separators and new lines', () => {
    const rows = [['a', 'b;c', 'd"e'], ['x\ny', '', '1,5']];
    const csv = T.toDelimited(rows, ';');
    assert.deepEqual(T.parseDelimited(csv, ';'), rows);
    assert.equal(T.detectDelimiter('a\tb\tc'), '\t');
    assert.equal(T.detectDelimiter('a;b,c;d'), ';');
    assert.deepEqual(T.parseDelimited('a,b\r\n1,2\r\n\r\n'), [['a', 'b'], ['1', '2']]);
    assert.deepEqual(T.parseDelimited('﻿a\tb\n"1\t2"\t3', '\t'), [['a', 'b'], ['1\t2', '3']]);
    assert.deepEqual(T.parseDelimited(''), []);
  });

  it('pastes a grid, growing the table, and builds a table from CSV', () => {
    const m = grid([['a', 'b'], ['1', '2']]);
    const rc = T.putGrid(m, 1, 1, [['x', 'y', 'z'], ['p', 'q', 'r']]);
    assert.deepEqual(rc, { r1: 1, c1: 1, r2: 2, c2: 3 });
    assert.equal(T.width(m), 4);
    assert.equal(m.rows.length, 3);
    assert.equal(m.rows[2][3].t, 'r');
    const n = T.fromGrid([['only']]);
    assert.equal(n.rows.length, 2);
    assert.equal(n.rows[0][0].t, 'only');
    assert.equal(T.fromGrid([]).rows.length, 2);
  });

  it('keeps a model valid after normalize', () => {
    const m = T.normalize({ rows: [[{ t: 'a' }, { t: 'b' }], [{ t: 'c' }]], w: [10], al: [] });
    assert.equal(m.rows[1].length, 2);
    assert.equal(m.al.length, 2);
    assert.deepEqual(m.w, []);
    assert.equal(T.normalize({ rows: [] }).rows.length, 2);
  });
});
