'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent, clearComponentCache } = require('./helpers/load');

function installDom() {
  class ClassList {
    constructor(el) {
      this._el = el;
      this._set = new Set();
    }
    _sync() {
      this._el._className = Array.from(this._set).join(' ');
    }
    add(...names) {
      names.forEach((n) => this._set.add(n));
      this._sync();
    }
    remove(...names) {
      names.forEach((n) => this._set.delete(n));
      this._sync();
    }
    toggle(name, force) {
      const on = force == null ? !this._set.has(name) : !!force;
      if (on) this._set.add(name);
      else this._set.delete(name);
      this._sync();
      return on;
    }
    contains(name) {
      return this._set.has(name);
    }
  }

  class Element {
    constructor(tag) {
      this.tagName = String(tag || 'div').toUpperCase();
      this.children = [];
      this.attributes = Object.create(null);
      this.style = {};
      this.dataset = Object.create(null);
      this.classList = new ClassList(this);
      this._className = '';
      this._text = '';
      this.parentNode = null;
      this.hidden = false;
      this.disabled = false;
      this.offsetWidth = 220;
      this.offsetHeight = 160;
      this._listeners = Object.create(null);
      Object.defineProperty(this, 'className', {
        get: () => this._className,
        set: (v) => {
          this._className = v == null ? '' : String(v);
          this.classList._set = new Set(
            this._className.split(/\s+/).filter(Boolean)
          );
        },
      });
    }
    get textContent() {
      if (this.children.length) {
        return this.children.map((c) => c.textContent || '').join('');
      }
      return this._text;
    }
    set textContent(v) {
      this.children.length = 0;
      this._text = v == null ? '' : String(v);
    }
    setAttribute(name, value) {
      this.attributes[name] = String(value);
      if (name === 'class') this.className = String(value);
      if (name === 'data-context-action') {
        this.dataset.contextAction = String(value);
      }
    }
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(this.attributes, name)
        ? this.attributes[name]
        : null;
    }
    appendChild(child) {
      if (!child) return child;
      if (child.parentNode) child.parentNode.removeChild(child);
      child.parentNode = this;
      this.children.push(child);
      return child;
    }
    removeChild(child) {
      const i = this.children.indexOf(child);
      if (i !== -1) {
        this.children.splice(i, 1);
        child.parentNode = null;
      }
      return child;
    }
    contains(node) {
      if (node === this) return true;
      for (const c of this.children) {
        if (c === node || (c.contains && c.contains(node))) return true;
      }
      return false;
    }
    querySelector(sel) {
      return this.querySelectorAll(sel)[0] || null;
    }
    querySelectorAll(sel) {
      const out = [];
      const walk = (node) => {
        for (const c of node.children || []) {
          if (matches(c, sel)) out.push(c);
          walk(c);
        }
      };
      walk(this);
      return out;
    }
    addEventListener(type, fn, _opts) {
      if (!this._listeners[type]) this._listeners[type] = [];
      this._listeners[type].push(fn);
    }
    removeEventListener(type, fn) {
      const list = this._listeners[type];
      if (!list) return;
      const i = list.indexOf(fn);
      if (i !== -1) list.splice(i, 1);
    }
    dispatchEvent(evt) {
      const list = this._listeners[evt.type] || [];
      for (const fn of list.slice()) fn(evt);
      return true;
    }
    focus() {}
    click() {
      this.dispatchEvent({
        type: 'click',
        preventDefault() {},
        stopPropagation() {},
      });
    }
  }

  function matches(el, sel) {
    sel = String(sel || '').trim();
    if (sel.startsWith('.')) {
      return el.classList.contains(sel.slice(1));
    }
    if (sel.includes('.')) {
      const [tag, cls] = sel.split('.');
      return (
        el.tagName === String(tag).toUpperCase() && el.classList.contains(cls)
      );
    }
    return el.tagName === sel.toUpperCase();
  }

  const body = new Element('body');
  const documentElement = new Element('html');
  documentElement.clientWidth = 800;
  documentElement.clientHeight = 600;

  const docListeners = Object.create(null);
  global.document = {
    body,
    documentElement,
    createElement(tag) {
      return new Element(tag);
    },
    createTextNode(t) {
      const n = new Element('#text');
      n.textContent = t;
      return n;
    },
    addEventListener(type, fn, _opts) {
      if (!docListeners[type]) docListeners[type] = [];
      docListeners[type].push(fn);
    },
    removeEventListener(type, fn) {
      const list = docListeners[type];
      if (!list) return;
      const i = list.indexOf(fn);
      if (i !== -1) list.splice(i, 1);
    },
    _dispatch(type, evt) {
      const list = docListeners[type] || [];
      for (const fn of list.slice()) fn(evt || { type });
    },
  };
  global.innerWidth = 800;
  global.innerHeight = 600;
  const winListeners = Object.create(null);
  const realAdd = global.addEventListener;
  const realRemove = global.removeEventListener;
  global.addEventListener = function (type, fn, opts) {
    if (!winListeners[type]) winListeners[type] = [];
    winListeners[type].push(fn);
    if (typeof realAdd === 'function') realAdd.call(global, type, fn, opts);
  };
  global.removeEventListener = function (type, fn, opts) {
    const list = winListeners[type];
    if (list) {
      const i = list.indexOf(fn);
      if (i !== -1) list.splice(i, 1);
    }
    if (typeof realRemove === 'function') realRemove.call(global, type, fn, opts);
  };
  global._winListeners = winListeners;
  global._docListeners = docListeners;
}

describe('ContextMenu', () => {
  let ContextMenu;

  beforeEach(() => {
    clearComponentCache();
    installDom();
    loadComponent('shared/context-menu.js');
    ContextMenu = global.ContextMenu;
    assert.ok(ContextMenu);
  });

  afterEach(() => {
    if (ContextMenu) ContextMenu.hide();
  });

  it('shows menu, invokes action on click, and hides', () => {
    let ran = false;
    const menu = ContextMenu.show(
      { clientX: 40, clientY: 50 },
      [
        {
          id: 'go',
          label: 'Go',
          action() {
            ran = true;
          },
        },
      ]
    );
    assert.ok(menu);
    assert.equal(menu.parentNode, global.document.body);
    const btn = menu.querySelector('.tp-context-menu-item');
    assert.ok(btn);
    assert.equal(btn.dataset.contextAction, 'go');
    btn.click();
    assert.equal(ran, true);
    assert.equal(menu.parentNode, null);
  });

  it('bind prevents default and opens menu from contextmenu', () => {
    const el = global.document.createElement('div');
    global.document.body.appendChild(el);
    let prevented = false;
    ContextMenu.bind(el, () => [
      {
        id: 'x',
        label: 'X',
        action() {},
      },
    ]);
    el.dispatchEvent({
      type: 'contextmenu',
      clientX: 10,
      clientY: 12,
      preventDefault() {
        prevented = true;
      },
      stopPropagation() {},
    });
    assert.equal(prevented, true);
    assert.ok(global.document.body.querySelector('.tp-context-menu'));
  });

  it('closes on Escape', () => {
    ContextMenu.show({ clientX: 1, clientY: 1 }, [
      { id: 'a', label: 'A', action() {} },
    ]);
    assert.ok(global.document.body.querySelector('.tp-context-menu'));
    // Wait for deferred outside listeners
    return new Promise((resolve) => {
      setTimeout(() => {
        global.document._dispatch('keydown', {
          type: 'keydown',
          key: 'Escape',
          preventDefault() {},
        });
        assert.equal(
          global.document.body.querySelector('.tp-context-menu'),
          null
        );
        resolve();
      }, 5);
    });
  });

  it('buildAgentItems includes edit-settings', () => {
    let opened = null;
    const items = ContextMenu.buildAgentItems({
      isExpanded: () => true,
      setExpanded() {},
      openSettings(opts) {
        opened = opts || {};
      },
    });
    const ids = items.filter((i) => !i.sep).map((i) => i.id);
    assert.ok(ids.includes('edit-settings'));
    assert.ok(ids.includes('open-memory'));
    const edit = items.find((i) => i.id === 'edit-settings');
    edit.action();
    assert.deepEqual(opened, {});
  });

  it('buildOverviewItems reflects blocked / overdue state', () => {
    const actions = [];
    const items = ContextMenu.buildOverviewItems({
      isExpanded: () => true,
      setExpanded() {},
      getData: () => ({
        progressBlocked: true,
        dueDays: -1,
        progressPercent: 40,
      }),
      onAction(id) {
        actions.push(id);
      },
    });
    const ids = items.filter((i) => !i.sep).map((i) => i.id);
    assert.ok(ids.includes('unblock'));
    assert.ok(!ids.includes('block'));
    const postpone = items.find((i) => i.id === 'postpone-tomorrow');
    assert.equal(postpone.disabled, false);
    postpone.action();
    assert.deepEqual(actions, ['postpone-tomorrow']);
  });

  it('buildDueItems includes quick suggestions and clear', () => {
    const applied = [];
    let cleared = false;
    const items = ContextMenu.buildDueItems({
      isExpanded: () => false,
      setExpanded() {},
      suggestions: [
        { id: 'demain-matin', label: 'Demain matin' },
        { id: 'dans-une-semaine', label: 'Dans une semaine' },
      ],
      applyQuick(id) {
        applied.push(id);
      },
      clearDue() {
        cleared = true;
      },
      clearDisabled: false,
    });
    const quick = items.find((i) => i.id === 'due-quick:demain-matin');
    assert.ok(quick);
    quick.action();
    assert.deepEqual(applied, ['demain-matin']);
    items.find((i) => i.id === 'clear-due').action();
    assert.equal(cleared, true);
  });

  it('buildGanttSectionItems disables move when nothing selected', () => {
    const items = ContextMenu.buildGanttSectionItems({
      sectionKey: 'blocked',
      expanded: true,
      selectedCount: 0,
      hideBlocked: false,
      onToggleExpand() {},
      onCollapseAll() {},
      onExpandAll() {},
      onMoveSelection() {},
      onSelectCards() {},
      onToggleHideBlocked() {},
    });
    const move = items.find((i) => i.id === 'move-selection');
    assert.equal(move.disabled, true);
    assert.ok(items.some((i) => i.id === 'toggle-hide-blocked'));
  });

  it('skips native menu on editable targets', () => {
    const el = global.document.createElement('div');
    const input = global.document.createElement('input');
    input.tagName = 'INPUT';
    el.appendChild(input);
    global.document.body.appendChild(el);
    let opened = false;
    ContextMenu.bind(el, () => {
      opened = true;
      return [{ id: 'x', label: 'X', action() {} }];
    });
    el.dispatchEvent({
      type: 'contextmenu',
      target: input,
      clientX: 10,
      clientY: 12,
      preventDefault() {},
      stopPropagation() {},
    });
    assert.equal(opened, false);
    assert.equal(ContextMenu.isNativeEditableTarget(input), true);
  });

  it('buildCompletionItemItems and checklist items', () => {
    const calls = [];
    const master = ContextMenu.buildCompletionItemItems({
      done: false,
      blocked: false,
      linked: false,
      canPromote: true,
      onToggleDone() {
        calls.push('done');
      },
      onToggleBlocked() {
        calls.push('block');
      },
      onShowProgress() {
        calls.push('prog');
      },
      onAddChecklist() {
        calls.push('add');
      },
      onPromote() {
        calls.push('promote');
      },
      onDelete() {
        calls.push('del');
      },
    });
    const ids = master.filter((i) => !i.sep).map((i) => i.id);
    assert.deepEqual(ids, [
      'toggle-done',
      'toggle-blocked',
      'show-progress',
      'add-checklist',
      'promote',
      'delete',
    ]);
    master.find((i) => i.id === 'promote').action();
    assert.deepEqual(calls, ['promote']);

    const nested = ContextMenu.buildChecklistItemItems({
      done: true,
      onToggleDone() {
        calls.push('nested');
      },
      onShowProgress() {},
      onDelete() {},
    });
    assert.equal(nested[0].label, 'Marquer non termin\u00e9');
  });

  it('buildGanttCardItems and agent message items', () => {
    const gantt = ContextMenu.buildGanttCardItems({
      kind: 'card',
      cardId: 'c1',
      selected: false,
      expandable: true,
      expanded: false,
      editable: true,
      done: false,
      deleteLabel: 'Archiver la carte',
      onOpen() {},
      onToggleSelect() {},
      onToggleExpand() {},
      onMiniBlocked() {},
      onMiniPriority() {},
      onMiniProgress() {},
      onMiniDue() {},
      onToggleDone() {},
      onDelete() {},
    });
    const gids = gantt.filter((i) => !i.sep).map((i) => i.id);
    assert.ok(gids.includes('open-card'));
    assert.ok(gids.includes('mini-priority'));
    assert.ok(gids.includes('delete'));

    const msg = ContextMenu.buildAgentMessageItems({
      role: 'assistant',
      canCopy: true,
      canFeedback: true,
      onCopy() {},
      onFeedbackUp() {},
      onFeedbackDown() {},
    });
    assert.ok(msg.some((i) => i.id === 'feedback-up'));
    assert.ok(msg.some((i) => i.id === 'copy'));
  });

  it('buildOverviewTaskItems and history entry items', () => {
    let jumped = false;
    const tasks = ContextMenu.buildOverviewTaskItems({
      done: false,
      blocked: true,
      onToggle() {},
      onJumpProgress() {
        jumped = true;
      },
    });
    assert.equal(tasks[0].label, 'D\u00e9bloquer');
    tasks[1].action();
    assert.equal(jumped, true);

    const hist = ContextMenu.buildHistoryEntryItems({
      undone: true,
      open: false,
      onToggleDetails() {},
      onRestore() {},
      onRevert() {},
    });
    assert.ok(hist.some((i) => i.id === 'restore'));
  });

  it('buildBulkActionItems and completion master items', () => {
    const calls = [];
    const bulk = ContextMenu.buildBulkActionItems({
      count: 2,
      onDone() {
        calls.push('done');
      },
      onReopen() {
        calls.push('reopen');
      },
      onDelete() {
        calls.push('del');
      },
      onClear() {
        calls.push('clear');
      },
      onSelectAll() {
        calls.push('all');
      },
    });
    assert.ok(bulk.some((i) => i.id === 'bulk-done'));
    bulk.find((i) => i.id === 'bulk-clear').action();
    assert.deepEqual(calls, ['clear']);

    const master = ContextMenu.buildCompletionMasterItems({
      done: false,
      blocked: true,
      onToggleComplete() {},
      onToggleBlocked() {},
      onCompleteAll() {
        calls.push('all-done');
      },
      onResetAll() {},
    });
    assert.ok(master.some((i) => i.id === 'complete-all'));
    master.find((i) => i.id === 'complete-all').action();
    assert.ok(calls.includes('all-done'));
  });

  it('buildGanttToolbarItems and agent composer items', () => {
    let mode = null;
    const toolbar = ContextMenu.buildGanttToolbarItems({
      viewMode: 'week',
      hideCompleted: true,
      hideBlocked: false,
      hideUndated: false,
      onViewMode(m) {
        mode = m;
      },
      onPrev() {},
      onToday() {},
      onNext() {},
      onToggleHideCompleted() {},
      onToggleHideBlocked() {},
      onToggleHideUndated() {},
    });
    assert.ok(toolbar.some((i) => i.id === 'zoom-month'));
    toolbar.find((i) => i.id === 'zoom-month').action();
    assert.equal(mode, 'month');
    assert.equal(
      toolbar.find((i) => i.id === 'filter-completed').label,
      'Afficher les termin\u00e9s'
    );

    let sent = false;
    const composer = ContextMenu.buildAgentComposerItems({
      sendDisabled: false,
      currentMode: 'auto',
      modes: [
        { id: 'auto', label: 'Auto' },
        { id: 'capable', label: 'Puissant' },
      ],
      onSend() {
        sent = true;
      },
      onSetMode() {},
    });
    assert.ok(composer.some((i) => i.id === 'send'));
    assert.ok(composer.some((i) => i.id === 'mode:capable'));
    composer.find((i) => i.id === 'send').action();
    assert.equal(sent, true);
  });
});
