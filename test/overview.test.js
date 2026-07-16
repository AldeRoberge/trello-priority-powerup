'use strict';

const { describe, it, beforeEach } = require('node:test');
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
      this.childNodes = this.children;
      this.attributes = Object.create(null);
      this.style = {
        _props: Object.create(null),
        setProperty(k, v) {
          this._props[k] = v;
          this[k] = v;
        },
        removeProperty(k) {
          delete this._props[k];
          delete this[k];
        },
      };
      this.dataset = Object.create(null);
      this.classList = new ClassList(this);
      this._className = '';
      Object.defineProperty(this, 'className', {
        get() {
          return this._className;
        },
        set(v) {
          this._className = v == null ? '' : String(v);
          this.classList._set = new Set(
            this._className.split(/\s+/).filter(Boolean)
          );
        },
      });
      this._text = '';
      this._html = '';
      this.parentNode = null;
      this.hidden = false;
      this.tabIndex = -1;
      this._listeners = Object.create(null);
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
      this._html = this._text;
    }
    get innerHTML() {
      return this._html;
    }
    set innerHTML(v) {
      this.children.length = 0;
      this._html = v == null ? '' : String(v);
      this._text = this._html.replace(/<[^>]+>/g, '');
    }
    setAttribute(name, value) {
      this.attributes[name] = String(value);
      if (name === 'hidden') this.hidden = true;
      if (name === 'class') {
        this.className = String(value);
        this.classList._set = new Set(
          String(value)
            .split(/\s+/)
            .filter(Boolean)
        );
      }
    }
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(this.attributes, name)
        ? this.attributes[name]
        : null;
    }
    removeAttribute(name) {
      delete this.attributes[name];
      if (name === 'hidden') this.hidden = false;
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
    replaceChild(next, old) {
      const i = this.children.indexOf(old);
      if (i === -1) return this.appendChild(next);
      if (next.parentNode) next.parentNode.removeChild(next);
      next.parentNode = this;
      if (old) old.parentNode = null;
      this.children[i] = next;
      return old;
    }
    insertBefore(child, ref) {
      if (!child) return child;
      if (child.parentNode) child.parentNode.removeChild(child);
      child.parentNode = this;
      const i = ref ? this.children.indexOf(ref) : -1;
      if (i === -1) this.children.push(child);
      else this.children.splice(i, 0, child);
      return child;
    }
    querySelector(sel) {
      return this.querySelectorAll(sel)[0] || null;
    }
    querySelectorAll(sel) {
      const parts = String(sel || '')
        .trim()
        .split(/\s+/)
        .filter(Boolean);
      if (!parts.length) return [];
      let current = [this];
      for (const part of parts) {
        const next = [];
        for (const root of current) {
          const walk = (node) => {
            for (const c of node.children || []) {
              if (matches(c, part)) next.push(c);
              walk(c);
            }
          };
          walk(root);
        }
        current = next;
      }
      return current;
    }
    addEventListener(type, fn) {
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
    click() {
      this.dispatchEvent({ type: 'click', preventDefault() {} });
    }
  }

  function matches(el, sel) {
    if (!el || !sel) return false;
    if (sel.startsWith('.')) {
      const cls = sel.slice(1).split('.')[0];
      return el.classList.contains(cls);
    }
    if (sel.startsWith('[') && sel.endsWith(']')) {
      const body = sel.slice(1, -1);
      const eq = body.indexOf('=');
      if (eq === -1) return el.getAttribute(body) != null;
      const key = body.slice(0, eq);
      let val = body.slice(eq + 1);
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      return el.getAttribute(key) === val || el.dataset[key] === val;
    }
    return el.tagName === sel.toUpperCase();
  }

  const doc = new Element('document');
  doc.createElement = (tag) => new Element(tag);
  doc.createElementNS = (_ns, tag) => new Element(tag);
  doc.createTextNode = (t) => {
    const n = new Element('#text');
    n.textContent = t;
    return n;
  };
  doc.createDocumentFragment = () => new Element('fragment');
  doc.body = new Element('body');
  doc.head = new Element('head');
  doc.documentElement = new Element('html');
  doc.getElementById = () => null;

  global.document = doc;
  global.window = global;
  global.HTMLElement = Element;
}

describe('PriorityUI createOverviewField', () => {
  let PriorityUI;

  beforeEach(() => {
    clearComponentCache();
    delete global.PriorityUI;
    installDom();
    loadComponent('priority/priority-ui.js');
    PriorityUI = global.PriorityUI;
    assert.ok(PriorityUI);
    assert.equal(typeof PriorityUI.createOverviewField, 'function');
  });

  it('mounts title and combined Progrès metric cells', () => {
    const ui = PriorityUI.createOverviewField({
      title: 'Ship overview',
      status: 'En cours',
      statusCategory: 'started',
      progressPercent: 40,
      subtasksDone: 2,
      subtasksTotal: 5,
      dueCountdown: 'Dans 3 jours',
      dueBand: 'soon',
      priorityLabel: 'Importante',
      priorityColor: '#0079BF',
    });

    assert.ok(ui.el);
    assert.ok(ui.el.classList.contains('variant-overview-section'));
    assert.ok(ui.field.classList.contains('field--overview'));
    assert.ok(ui.field.classList.contains('is-enabled'));

    const title = ui.el.querySelector('.overview-title-text');
    assert.equal(title.textContent, 'Ship overview');

    assert.equal(ui.el.querySelector('.overview-cell--status'), null);
    assert.ok(ui.el.querySelector('.overview-cell--progress'));
    assert.ok(ui.el.querySelector('.overview-cell--subtasks'));
    assert.ok(ui.el.querySelector('.overview-cell--due'));
    assert.ok(ui.el.querySelector('.overview-cell--priority'));

    // In progress → show % (not the list name).
    assert.match(
      ui.el.querySelector('.overview-cell--progress .overview-cell-value').textContent,
      /40/
    );
    assert.doesNotMatch(
      ui.el.querySelector('.overview-cell--progress .overview-cell-value').textContent,
      /En cours/
    );
    assert.match(
      ui.el.querySelector('.overview-cell--subtasks .overview-cell-value').textContent,
      /2/
    );
  });

  it('invokes onJump with the matching section key', () => {
    const jumps = [];
    const ui = PriorityUI.createOverviewField({
      title: 'Card',
      progressPercent: 20,
      subtasksDone: 0,
      subtasksTotal: 2,
      dueCountdown: 'Demain',
      onJump(key) {
        jumps.push(key);
      },
    });

    ui.el.querySelector('.overview-title').click();
    ui.el.querySelector('.overview-cell--progress').click();
    ui.el.querySelector('.overview-cell--subtasks').click();
    ui.el.querySelector('.overview-cell--due').click();
    ui.el.querySelector('.overview-cell--priority').click();

    assert.deepEqual(jumps, [
      'info',
      'progress',
      'progress',
      'due',
      'priority',
    ]);
  });

  it('blocked Progrès jumps to blocked section', () => {
    const jumps = [];
    const ui = PriorityUI.createOverviewField({
      status: 'Bloqué',
      statusCategory: 'blocked',
      progressPercent: 40,
      onJump(key) {
        jumps.push(key);
      },
    });
    ui.el.querySelector('.overview-cell--progress').click();
    assert.deepEqual(jumps, ['blocked']);
  });

  it('setData updates values and hides disabled features', () => {
    const ui = PriorityUI.createOverviewField({
      title: 'A',
      status: 'Todo',
      progressPercent: 10,
      subtasksDone: 0,
      subtasksTotal: 1,
      dueCountdown: 'Demain',
      priorityLabel: 'Flexible',
    });

    ui.setData({
      title: 'Renamed',
      status: 'Done',
      statusCategory: 'completed',
      progressPercent: 100,
      subtasksDone: 1,
      subtasksTotal: 1,
      dueCountdown: 'En retard',
      dueBand: 'overdue',
      priorityLabel: 'Critique',
      priorityColor: '#C9372C',
      features: {
        statut: true,
        progress: false,
        due: true,
        priority: false,
      },
    });

    assert.equal(ui.el.querySelector('.overview-title-text').textContent, 'Renamed');
    // Done → status label in Progrès (statut feature keeps the cell visible).
    assert.match(
      ui.el.querySelector('.overview-cell--progress .overview-cell-value').textContent,
      /Done|Termin/
    );
    assert.equal(
      ui.el.querySelector('.overview-cell--progress').getAttribute('hidden'),
      null
    );
    assert.equal(
      ui.el.querySelector('.overview-cell--subtasks').getAttribute('hidden'),
      ''
    );
    assert.equal(
      ui.el.querySelector('.overview-cell--priority').getAttribute('hidden'),
      ''
    );
    assert.equal(
      ui.el.querySelector('.overview-cell--due').getAttribute('hidden'),
      null
    );
    assert.ok(
      ui.el.querySelector('.overview-cell--due').classList.contains('is-due-overdue')
    );

    const data = ui.getData();
    assert.equal(data.title, 'Renamed');
    assert.equal(data.progressPercent, 100);
    assert.equal(data.features.progress, false);
    assert.equal(data.features.priority, false);
  });

  it('shows status when blocked, percent otherwise', () => {
    const ui = PriorityUI.createOverviewField({
      title: 'Card',
      status: 'Bloqué',
      statusCategory: 'blocked',
      statusColor: '#e34935',
      progressPercent: 55,
      progressColor: '#0c66e4',
      progressBlocked: true,
      priorityLabel: 'Critique',
      priorityColor: '#C9372C',
    });

    const progressCell = ui.el.querySelector('.overview-cell--progress');
    assert.ok(progressCell.classList.contains('is-blocked'));
    assert.ok(progressCell.classList.contains('is-status-mode'));
    assert.match(
      progressCell.querySelector('.overview-cell-value').textContent,
      /Bloqu/
    );
    assert.ok(progressCell.querySelector('.overview-status-icon'));
    assert.equal(
      progressCell.style._props['--overview-status-accent'],
      '#e34935'
    );

    ui.setData({
      status: 'En cours',
      statusCategory: 'started',
      progressBlocked: false,
      progressPercent: 55,
      progressColor: '#0c66e4',
    });
    assert.ok(progressCell.classList.contains('is-progress-mode'));
    assert.match(
      progressCell.querySelector('.overview-cell-value').textContent,
      /55/
    );
    assert.ok(progressCell.querySelector('.overview-progress-ring'));
    assert.ok(progressCell.classList.contains('has-progress-accent'));
  });

  it('shows Terminé status when completed', () => {
    const ui = PriorityUI.createOverviewField({
      status: 'Terminé',
      statusCategory: 'completed',
      statusColor: '#22a06b',
      progressPercent: 100,
    });
    const progressCell = ui.el.querySelector('.overview-cell--progress');
    assert.ok(progressCell.classList.contains('is-done'));
    assert.ok(progressCell.classList.contains('is-status-mode'));
    assert.match(
      progressCell.querySelector('.overview-cell-value').textContent,
      /Termin/
    );
  });

  it('falls back to status label when no percent', () => {
    const ui = PriorityUI.createOverviewField({
      status: 'À faire',
      statusCategory: 'unstarted',
      progressPercent: null,
    });
    assert.match(
      ui.el.querySelector('.overview-cell--progress .overview-cell-value').textContent,
      /faire|À faire/i
    );
  });

  it('hides Sous-tâches and Échéance when empty', () => {
    const ui = PriorityUI.createOverviewField({
      title: 'Card',
      progressPercent: 10,
      subtasksDone: 0,
      subtasksTotal: 0,
      dueCountdown: '',
      priorityLabel: 'Flexible',
    });

    assert.equal(
      ui.el.querySelector('.overview-cell--subtasks').getAttribute('hidden'),
      ''
    );
    assert.equal(
      ui.el.querySelector('.overview-cell--due').getAttribute('hidden'),
      ''
    );

    ui.setData({
      subtasksDone: 1,
      subtasksTotal: 3,
      dueCountdown: 'Dans 2 jours',
      dueBand: 'soon',
    });

    assert.equal(
      ui.el.querySelector('.overview-cell--subtasks').getAttribute('hidden'),
      null
    );
    assert.equal(
      ui.el.querySelector('.overview-cell--due').getAttribute('hidden'),
      null
    );
    assert.match(
      ui.el.querySelector('.overview-cell--subtasks .overview-cell-value').textContent,
      /1/
    );
    assert.match(
      ui.el.querySelector('.overview-cell--due .overview-cell-value').textContent,
      /2 jours/
    );

    ui.setData({ subtasksTotal: 0, dueCountdown: '' });
    assert.equal(
      ui.el.querySelector('.overview-cell--subtasks').getAttribute('hidden'),
      ''
    );
    assert.equal(
      ui.el.querySelector('.overview-cell--due').getAttribute('hidden'),
      ''
    );
  });

  it('setData renders statusBrief and hides when empty', () => {
    const ui = PriorityUI.createOverviewField({
      title: 'Card',
      statusBrief: 'Tu es dessus, mais sans échéance claire.',
    });

    const brief = ui.el.querySelector('.overview-status-brief');
    assert.ok(brief);
    assert.equal(brief.hidden, false);
    assert.match(brief.textContent, /Tu es dessus/);
    assert.equal(ui.getData().statusBrief, 'Tu es dessus, mais sans échéance claire.');

    ui.setData({ statusBrief: '', statusBriefPending: false });
    assert.equal(brief.hidden, true);
    assert.equal(brief.textContent, '');

    ui.setData({
      statusBrief: 'C’est bloqué de ton côté.',
      statusBriefPending: true,
    });
    assert.equal(brief.hidden, false);
    assert.ok(brief.classList.contains('is-pending'));
    assert.match(brief.textContent, /bloqu/i);
  });
});
