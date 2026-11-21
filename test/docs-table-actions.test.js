'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent } = require('./helpers/load');

describe('DocsTableActions', () => {
  let T;
  let A;
  before(() => {
    loadComponent('docs/docs-table-model.js');
    loadComponent('docs/docs-table-actions.js');
    T = global.DocsTableModel;
    A = global.DocsTableActions;
  });

  const make = () => T.fromGrid([['a', 'b', 'c'], ['1', '2', '3'], ['4', '5', '6']]);
  const at = (r, c) => ({ r1: r, c1: c, r2: r, c2: c });

  it('inserts rows and columns and returns the selection to show', () => {
    const m = make();
    assert.deepEqual(A.run(m, 'row-below', at(1, 1)).sel, at(2, 1));
    assert.equal(m.rows.length, 4);
    assert.deepEqual(A.run(m, 'row-above', at(1, 0)).sel, at(1, 0));
    assert.equal(A.run(m, 'row-above', at(0, 0)), null);
    assert.deepEqual(A.run(m, 'col-right', at(0, 2)).sel, at(0, 3));
    assert.equal(T.width(m), 4);
  });

  it('never deletes the header, the last body row or the last column', () => {
    const m = T.fromGrid([['a'], ['1']]);
    assert.equal(A.run(m, 'row-del', at(0, 0)), null);
    assert.equal(A.run(m, 'row-del', at(1, 0)), null);
    assert.equal(A.run(m, 'col-del', at(0, 0)), null);
    const big = make();
    assert.ok(A.run(big, 'col-del', { r1: 0, c1: 0, r2: 0, c2: 1 }));
    assert.equal(T.width(big), 1);
    assert.equal(big.rows[0][0].t, 'c');
  });

  it('moves a row or a column and the selection follows', () => {
    const m = make();
    assert.deepEqual(A.run(m, 'row-down', at(1, 0)).sel, at(2, 0));
    assert.equal(m.rows[2][0].t, '1');
    assert.equal(A.run(m, 'row-down', at(2, 0)), null);
    assert.equal(A.run(m, 'row-up', at(1, 0)), null);
    assert.deepEqual(A.run(m, 'col-mvright', at(0, 0)).sel, at(0, 1));
    assert.equal(m.rows[0][1].t, 'a');
    assert.equal(A.run(m, 'col-mvleft', at(0, 0)), null);
  });

  it('colors, formats and aligns a whole selection', () => {
    const m = make();
    A.run(m, 'bg', { r1: 1, c1: 0, r2: 2, c2: 1 }, 'green');
    assert.equal(m.rows[2][1].bg, 'green');
    assert.equal(m.rows[2][2].bg, undefined);
    A.run(m, 'fg', at(1, 0), 'red');
    assert.equal(m.rows[1][0].fg, 'red');
    A.run(m, 'align-center', { r1: 0, c1: 0, r2: 0, c2: 1 });
    assert.deepEqual(m.al, ['center', 'center', '']);
    A.run(m, 'fmt-cur', at(1, 1));
    assert.equal(m.rows[1][1].t, '2,00 $');
  });

  it('replaces the conditional rules with cleaned ones', () => {
    const m = make();
    A.run(m, 'cf', at(0, 0), [{ c: 1, op: 'gt', v: '3', bg: 'red' }, { op: 'nope' }, null]);
    assert.equal(m.cf.length, 1);
    assert.equal(m.cf[0].bg, 'red');
  });

  it('sorts by the selected column and sums the selection', () => {
    const m = make();
    assert.ok(A.run(m, 'sort-desc', at(1, 0)));
    assert.equal(m.rows[1][0].t, '4');
    const res = A.run(m, 'sum', { r1: 1, c1: 0, r2: 2, c2: 0 });
    assert.deepEqual(res.sel, at(3, 0));
    T.recalc(m);
    assert.equal(m.rows[3][0].t, '5');
  });

  it('knows nothing about an unknown command', () => {
    assert.equal(A.run(make(), 'unknown', at(0, 0)), null);
  });

  it('lists every menu command it can run', () => {
    Object.keys(A.MENUS).forEach((group) => {
      A.MENUS[group].forEach((item) => {
        const m = T.fromGrid([['a', 'b', 'c'], ['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9']]);
        // a command may refuse (nothing to do) but must never throw
        assert.doesNotThrow(() => A.run(m, item.id, at(2, 1)), item.id);
      });
    });
  });
});
