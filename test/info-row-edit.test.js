'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent } = require('./helpers/load');

function el(tag, opts, children) {
  const node = {
    tagName: String(tag || 'div').toUpperCase(),
    hidden: !!(opts && opts.hidden),
    disabled: !!(opts && opts.disabled),
    readOnly: !!(opts && opts.readOnly),
    className: (opts && opts.className) || '',
    contentEditable: opts && opts.contentEditable,
    parentElement: null,
    children: children || [],
  };
  node.children.forEach(function (child) {
    child.parentElement = node;
  });
  node.querySelectorAll = function () {
    const out = [];
    (function walk(n) {
      n.children.forEach(function (child) {
        const t = child.tagName;
        if (
          t === 'TEXTAREA' ||
          t === 'INPUT' ||
          t === 'BUTTON' ||
          child.contentEditable === 'true'
        ) {
          out.push(child);
        }
        walk(child);
      });
    })(node);
    return out;
  };
  return node;
}

describe('empty info-row edit target', () => {
  let firstRowEditControl;

  before(() => {
    loadComponent('priority/priority-ui.js');
    firstRowEditControl = global.PriorityUI.firstRowEditControl;
    assert.equal(typeof firstRowEditControl, 'function');
  });

  it('opens the label picker instead of focusing its hidden search field', () => {
    const addBtn = el('button', { className: 'info-labels-add-btn' });
    const search = el('input', { className: 'info-labels-search' });
    const root = el('div', {}, [
      addBtn,
      el('div', { hidden: true, className: 'info-labels-picker' }, [search]),
    ]);
    assert.equal(firstRowEditControl(root), addBtn);
  });

  it('opens the parent picker instead of focusing its hidden search field', () => {
    const pickBtn = el('button', { className: 'info-parent-pick-btn' });
    const search = el('input', { className: 'info-parent-search' });
    const root = el('div', {}, [
      pickBtn,
      el('div', { hidden: true, className: 'info-parent-picker' }, [search]),
    ]);
    assert.equal(firstRowEditControl(root), pickBtn);
  });

  it('opens the task-type picker instead of the create field inside it', () => {
    const addBtn = el('button', { className: 'info-task-types-add-btn' });
    const create = el('input', { className: 'info-task-types-create-input' });
    const root = el('div', {}, [
      addBtn,
      el('div', { hidden: true }, [create]),
    ]);
    assert.equal(firstRowEditControl(root), addBtn);
  });

  it('focuses a visible objectif field and ignores the create button', () => {
    const input = el('input', { className: 'tp-goals-input' });
    const create = el('button', { className: 'tp-button tp-button--secondary' });
    const root = el('div', {}, [input, create]);
    assert.equal(firstRowEditControl(root), input);
  });

  it('starts a place from the first visible choice', () => {
    const at = el('button', { className: 'info-route-choose-btn' });
    const route = el('button', { className: 'info-route-choose-btn' });
    const root = el('div', {}, [at, route]);
    assert.equal(firstRowEditControl(root), at);
  });

  it('skips a disabled add button', () => {
    const addBtn = el('button', { className: 'info-members-add-btn', disabled: true });
    const root = el('div', {}, [addBtn]);
    assert.equal(firstRowEditControl(root), null);
  });

  it('focuses a visible description editor', () => {
    const rich = el('div', { contentEditable: 'true', className: 'info-desc-rich' });
    const root = el('div', {}, [rich]);
    assert.equal(firstRowEditControl(root), rich);
  });
});
