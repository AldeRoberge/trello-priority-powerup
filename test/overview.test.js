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
    replaceChildren(...nodes) {
      while (this.children.length) {
        const c = this.children.pop();
        if (c) c.parentNode = null;
      }
      this._text = '';
      this._html = '';
      for (const node of nodes) {
        if (node == null) continue;
        if (typeof node === 'string') {
          this._text += node;
          this._html += node;
        } else {
          this.appendChild(node);
        }
      }
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
    assert.equal(ui.el.querySelector('.overview-cell--subtasks'), null);
    assert.ok(ui.el.querySelector('.overview-cell--due'));
    assert.ok(ui.el.querySelector('.overview-cell--priority'));
    assert.equal(ui.el.querySelector('.overview-status-brief'), null);

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
      ui.el.querySelector('.overview-cell--due .overview-cell-value').textContent,
      /3 jours/
    );
    assert.equal(
      ui.el.querySelector('.overview-cell--due .overview-cell-label'),
      null
    );
  });

  it('invokes onJump with the matching section key', () => {
    const jumps = [];
    const ui = PriorityUI.createOverviewField({
      title: 'Card',
      progressPercent: 20,
      dueCountdown: 'Demain',
      onJump(key) {
        jumps.push(key);
      },
    });

    ui.el.querySelector('.overview-title').click();
    ui.el.querySelector('.overview-cell--progress').click();
    ui.el.querySelector('.overview-cell--due').click();
    ui.el.querySelector('.overview-cell--priority').click();

    assert.deepEqual(jumps, [
      'info',
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
      dueCountdown: 'Demain',
      priorityLabel: 'Flexible',
    });

    ui.setData({
      title: 'Renamed',
      status: 'Done',
      statusCategory: 'completed',
      progressPercent: 100,
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
      ui.el.querySelector('.overview-cell--priority').getAttribute('hidden'),
      ''
    );
    assert.equal(
      ui.el.querySelector('.overview-cell--due').getAttribute('hidden'),
      null
    );
    // Completed overrides overdue → Complété (not overdue band).
    assert.ok(
      ui.el.querySelector('.overview-cell--due').classList.contains('is-done')
    );
    assert.ok(
      !ui.el.querySelector('.overview-cell--due').classList.contains('is-due-overdue')
    );
    assert.match(
      ui.el.querySelector('.overview-cell--due .overview-cell-value').textContent,
      /Compl/
    );

    const data = ui.getData();
    assert.equal(data.title, 'Renamed');
    assert.equal(data.progressPercent, 100);
    assert.equal(data.features.progress, false);
    assert.equal(data.features.priority, false);
  });

  it('shows pause ring when blocked, percent otherwise', () => {
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
    assert.ok(progressCell.classList.contains('is-progress-mode'));
    const ring = progressCell.querySelector('.overview-progress-ring');
    assert.ok(ring);
    assert.ok(ring.classList.contains('is-blocked'));
    assert.match(ring.innerHTML, /pause/i);
    assert.match(
      progressCell.querySelector('.overview-cell-value').textContent,
      /55/
    );
    assert.equal(
      progressCell.style._props['--overview-progress-accent'],
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
    assert.doesNotMatch(
      progressCell.querySelector('.overview-progress-ring').innerHTML,
      /pause/i
    );
  });

  it('shows pause ring beside Bloqué when blocked with no percent', () => {
    const ui = PriorityUI.createOverviewField({
      status: 'Bloqué',
      statusCategory: 'blocked',
      statusColor: '#e34935',
      progressPercent: null,
      progressBlocked: true,
    });
    const progressCell = ui.el.querySelector('.overview-cell--progress');
    assert.ok(progressCell.classList.contains('is-blocked'));
    assert.ok(progressCell.classList.contains('is-status-mode'));
    const ring = progressCell.querySelector('.overview-progress-ring');
    assert.ok(ring);
    assert.ok(ring.classList.contains('is-blocked'));
    assert.match(ring.innerHTML, /pause/i);
    assert.match(
      progressCell.querySelector('.overview-cell-value').textContent,
      /Bloqu/
    );
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

  it('completed overdue shows Complété, grayed priority, and no action chips', () => {
    const ui = PriorityUI.createOverviewField({
      status: 'Terminé',
      statusCategory: 'completed',
      statusColor: '#22a06b',
      progressPercent: 100,
      dueCountdown: 'En retard de 2 jours',
      dueBand: 'overdue',
      dueDays: -2,
      priorityLabel: 'Critique',
      priorityColor: '#C9372C',
    });

    const dueCell = ui.el.querySelector('.overview-cell--due');
    assert.ok(dueCell.classList.contains('is-done'));
    assert.ok(!dueCell.classList.contains('is-overdue'));
    assert.ok(!dueCell.classList.contains('is-due-overdue'));
    assert.equal(dueCell.dataset.dueBand, undefined);
    assert.match(dueCell.querySelector('.overview-cell-value').textContent, /Compl/);

    const priorityCell = ui.el.querySelector('.overview-cell--priority');
    assert.ok(priorityCell.classList.contains('is-complete'));
    assert.ok(!priorityCell.classList.contains('has-priority-color'));
    assert.match(
      priorityCell.querySelector('.overview-cell-value').textContent,
      /Critique/
    );
    assert.equal(priorityCell.getAttribute('hidden'), null);

    assert.equal(ui.el.querySelector('.overview-actions').hidden, true);
    assert.equal(ui.el.querySelectorAll('.overview-action-chip').length, 0);
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

  it('hides Échéance when empty', () => {
    const ui = PriorityUI.createOverviewField({
      title: 'Card',
      progressPercent: 10,
      dueCountdown: '',
      priorityLabel: 'Flexible',
    });

    assert.equal(ui.el.querySelector('.overview-cell--subtasks'), null);
    assert.equal(
      ui.el.querySelector('.overview-cell--due').getAttribute('hidden'),
      ''
    );

    ui.setData({
      dueCountdown: 'Dans 2 jours',
      dueBand: 'soon',
    });

    assert.equal(
      ui.el.querySelector('.overview-cell--due').getAttribute('hidden'),
      null
    );
    assert.match(
      ui.el.querySelector('.overview-cell--due .overview-cell-value').textContent,
      /2 jours/
    );

    ui.setData({ dueCountdown: '' });
    assert.equal(
      ui.el.querySelector('.overview-cell--due').getAttribute('hidden'),
      ''
    );
  });

  it('shows action chips for blocked and due today, and fires onAction', () => {
    const actions = [];
    const ui = PriorityUI.createOverviewField({
      title: 'Card',
      statusCategory: 'blocked',
      progressBlocked: true,
      dueCountdown: "Aujourd'hui",
      dueDays: 0,
      onAction(id) {
        actions.push(id);
      },
    });

    const row = ui.el.querySelector('.overview-actions');
    assert.ok(row);
    assert.equal(row.hidden, false);
    const chips = ui.el.querySelectorAll('.overview-action-chip');
    assert.equal(chips.length, 2);
    assert.match(chips[0].textContent, /d[eé]bloqu/i);
    assert.match(chips[1].textContent, /Reporter/i);
    assert.equal(chips[0].dataset.overviewAction, 'unblock');
    assert.equal(chips[1].dataset.overviewAction, 'postpone-tomorrow');

    chips[0].click();
    chips[1].click();
    assert.deepEqual(actions, ['unblock', 'postpone-tomorrow']);

    ui.setData({
      statusCategory: 'started',
      progressBlocked: false,
      dueDays: 3,
      dueCountdown: 'Dans 3 jours',
    });
    assert.equal(ui.el.querySelector('.overview-actions').hidden, true);
    assert.equal(ui.el.querySelectorAll('.overview-action-chip').length, 0);
  });

  it('shows Reporter chip when overdue', () => {
    const ui = PriorityUI.createOverviewField({
      dueCountdown: 'En retard de 1 jour',
      dueDays: -1,
      dueBand: 'overdue',
    });
    const chips = ui.el.querySelectorAll('.overview-action-chip');
    assert.equal(chips.length, 1);
    assert.equal(chips[0].dataset.overviewAction, 'postpone-tomorrow');
  });

  it('collapses and expands with summary showing the title', () => {
    const ui = PriorityUI.createOverviewField({
      title: 'Campagne lancement',
      progressPercent: 40,
      expanded: true,
    });

    assert.ok(ui.field.classList.contains('field--overview'));
    assert.equal(ui.isExpanded(), true);
    assert.ok(!ui.field.classList.contains('is-collapsed'));

    const body = ui.el.querySelector('.overview-section-body');
    assert.ok(body);
    assert.equal(body.hidden, false);

    ui.setExpanded(false);
    assert.equal(ui.isExpanded(), false);
    assert.ok(ui.field.classList.contains('is-collapsed'));
    assert.equal(body.hidden, true);

    const summary = ui.el.querySelector('.section-toggle-summary');
    assert.ok(summary);
    assert.equal(summary.hidden, false);
    assert.match(summary.textContent, /Campagne lancement/);

    ui.setExpanded(true);
    assert.equal(ui.isExpanded(), true);
    assert.equal(body.hidden, false);
  });

  it('buildProgressSummaryNode paints ring, percent, bar, and color', () => {
    assert.equal(typeof PriorityUI.buildProgressSummaryNode, 'function');
    assert.equal(PriorityUI.buildProgressSummaryNode({}), '');
    assert.equal(
      PriorityUI.buildProgressSummaryNode({ progressPercent: null }),
      ''
    );

    const node = PriorityUI.buildProgressSummaryNode({
      progressPercent: 40,
      progressColor: '#0c66e4',
      title: '2 tâches restantes',
    });
    assert.ok(node);
    assert.ok(node.classList.contains('progress-summary'));
    assert.ok(node.classList.contains('has-progress-accent'));
    assert.equal(node.title, '2 tâches restantes');
    assert.equal(
      node.style._props['--overview-progress-accent'],
      '#0c66e4'
    );

    const ring = node.querySelector('.overview-progress-ring');
    assert.ok(ring);
    assert.ok(ring.classList.contains('has-progress'));
    assert.equal(ring.style._props['--completion-progress'], '40');
    assert.equal(ring.style._props['--completion-check-fill'], '#0c66e4');

    assert.match(node.querySelector('.overview-progress-pct').textContent, /40/);
    assert.equal(
      node.querySelector('.overview-progress-fill').style.width,
      '40%'
    );
  });

  it('buildProgressSummaryNode marks blocked and complete states', () => {
    const blocked = PriorityUI.buildProgressSummaryNode({
      progressPercent: 55,
      progressBlocked: true,
      title: "En attente d'une approbation",
    });
    assert.ok(blocked.classList.contains('is-blocked'));
    const blockedRing = blocked.querySelector('.overview-progress-ring');
    assert.ok(blockedRing.classList.contains('is-blocked'));
    assert.match(blockedRing.innerHTML, /pause/i);
    const reason = blocked.querySelector('.progress-summary-reason');
    assert.ok(reason);
    assert.match(reason.textContent, /approbation/i);
    assert.doesNotMatch(
      blocked.querySelector('.overview-progress-pct').textContent,
      /55/
    );

    const done = PriorityUI.buildProgressSummaryNode({
      progressPercent: 100,
      progressColor: '#22a06b',
    });
    const doneRing = done.querySelector('.overview-progress-ring');
    assert.ok(doneRing.classList.contains('is-checked'));
    assert.equal(
      done.querySelector('.overview-progress-fill').style.width,
      '100%'
    );
  });
});
