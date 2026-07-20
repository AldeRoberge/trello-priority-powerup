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
      this.disabled = false;
      this.tabIndex = -1;
      this.value = '';
      this.type = '';
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
      if (name === 'data-overview-action') {
        this.dataset.overviewAction = String(value);
      }
      if (name === 'data-task-id') {
        this.dataset.taskId = String(value);
      }
      if (name === 'data-overview-key') {
        this.dataset.overviewKey = String(value);
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
      this.dispatchEvent({
        type: 'click',
        preventDefault() {},
        stopPropagation() {},
      });
    }
    focus() {}
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
  global.localStorage = {
    _data: Object.create(null),
    getItem(k) {
      return Object.prototype.hasOwnProperty.call(this._data, k)
        ? this._data[k]
        : null;
    },
    setItem(k, v) {
      this._data[k] = String(v);
    },
    removeItem(k) {
      delete this._data[k];
    },
  };
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

  it('mounts title, status hero, and meta cells', () => {
    const ui = PriorityUI.createOverviewField({
      title: 'Ship overview',
      status: 'En cours',
      statusCategory: 'started',
      progressPercent: 40,
      dueCountdown: 'Dans 3 jours',
      dueBand: 'soon',
      priorityLabel: 'Importante',
      priorityColor: '#0079BF',
      summaryText: 'Reste : Rédiger le brief.',
      tasksDone: 1,
      tasksTotal: 3,
      tasks: [{ id: 'a', text: 'Rédiger le brief', done: false, blocked: false }],
    });

    assert.ok(ui.el);
    assert.ok(ui.el.classList.contains('variant-overview-section'));
    assert.ok(ui.field.classList.contains('field--overview'));
    assert.ok(ui.field.classList.contains('is-enabled'));

    const title = ui.el.querySelector('.overview-title-text');
    assert.equal(title.textContent, 'Ship overview');

    const hero = ui.el.querySelector('.overview-hero');
    assert.ok(hero);
    assert.match(hero.querySelector('.overview-hero-phase').textContent, /cours/i);
    assert.match(hero.querySelector('.overview-hero-pct').textContent, /40/);
    assert.match(hero.querySelector('.overview-hero-count').textContent, /1\/3/);
    assert.match(
      hero.querySelector('.overview-hero-sentence').textContent,
      /brief/i
    );

    assert.ok(ui.el.querySelector('.overview-cell--due'));
    assert.ok(ui.el.querySelector('.overview-cell--priority'));
    assert.match(
      ui.el.querySelector('.overview-cell--due .overview-cell-value').textContent,
      /3 jours/
    );
    assert.equal(
      ui.el.querySelector('.overview-cell--due .overview-cell-label'),
      null
    );
    assert.match(
      ui.el.querySelector('.overview-task-text').textContent,
      /brief/i
    );
  });

  it('renders Motifs and open tasks from setData', () => {
    const ui = PriorityUI.createOverviewField({
      title: 'Card',
      progressPercent: 20,
    });
    ui.setData({
      statusCategory: 'blocked',
      progressBlocked: true,
      blockedReasons: ["En attente d'une approbation", 'Budget insuffisant'],
      summaryText: "En attente d'une approbation",
      tasksDone: 1,
      tasksTotal: 3,
      tasks: [
        { id: 't1', text: 'Relire la maquette', done: false, blocked: true },
        { id: 't2', text: 'Envoyer au client', done: false, blocked: false },
      ],
    });

    const motifs = ui.el.querySelector('.overview-motifs');
    assert.ok(motifs);
    assert.equal(motifs.hidden, false);
    const chips = ui.el.querySelectorAll('.overview-motif-chip');
    assert.equal(chips.length, 2);
    assert.match(chips[0].textContent, /approbation/i);

    const rows = ui.el.querySelectorAll('.overview-task-row');
    assert.equal(rows.length, 2);
    assert.ok(rows[0].classList.contains('is-blocked'));
    assert.match(
      ui.el.querySelector('.overview-tasks-done-hint').textContent,
      /1 termin/
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
    ui.el.querySelector('.overview-hero').click();
    ui.el.querySelector('.overview-cell--due').click();
    ui.el.querySelector('.overview-cell--priority').click();

    assert.deepEqual(jumps, ['info', 'progress', 'due', 'priority']);
  });

  it('blocked hero jumps to blocked section', () => {
    const jumps = [];
    const ui = PriorityUI.createOverviewField({
      status: 'Bloqué',
      statusCategory: 'blocked',
      progressPercent: 40,
      onJump(key) {
        jumps.push(key);
      },
    });
    ui.el.querySelector('.overview-hero').click();
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
    assert.match(
      ui.el.querySelector('.overview-hero-phase').textContent,
      /Done|Termin/
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

    const hero = ui.el.querySelector('.overview-hero');
    assert.ok(hero.classList.contains('is-blocked'));
    const ring = hero.querySelector('.overview-progress-ring');
    assert.ok(ring);
    assert.ok(ring.classList.contains('is-blocked'));
    assert.match(ring.innerHTML, /pause/i);
    assert.equal(
      hero.style._props['--overview-progress-accent'],
      '#e34935'
    );

    ui.setData({
      status: 'En cours',
      statusCategory: 'started',
      progressBlocked: false,
      progressPercent: 55,
      progressColor: '#0c66e4',
    });
    assert.ok(!hero.classList.contains('is-blocked'));
    assert.match(hero.querySelector('.overview-hero-pct').textContent, /55/);
    assert.ok(hero.classList.contains('has-progress-accent'));
    assert.doesNotMatch(
      hero.querySelector('.overview-progress-ring').innerHTML,
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
    const hero = ui.el.querySelector('.overview-hero');
    assert.ok(hero.classList.contains('is-blocked'));
    const ring = hero.querySelector('.overview-progress-ring');
    assert.ok(ring);
    assert.ok(ring.classList.contains('is-blocked'));
    assert.match(ring.innerHTML, /pause/i);
    assert.match(hero.querySelector('.overview-hero-phase').textContent, /Bloqu/);
  });

  it('shows Terminé status when completed', () => {
    const ui = PriorityUI.createOverviewField({
      status: 'Terminé',
      statusCategory: 'completed',
      statusColor: '#22a06b',
      progressPercent: 100,
    });
    const hero = ui.el.querySelector('.overview-hero');
    assert.ok(hero.classList.contains('is-done'));
    assert.match(hero.querySelector('.overview-hero-phase').textContent, /Termin/);
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
      ui.el.querySelector('.overview-hero-phase').textContent,
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
      onAction(id, payload) {
        actions.push(payload !== undefined ? { id, payload } : id);
      },
    });

    const row = ui.el.querySelector('.overview-actions');
    assert.ok(row);
    assert.equal(row.hidden, false);
    const chips = ui.el.querySelectorAll('.overview-action-chip');
    const ids = Array.from(chips).map((c) => c.dataset.overviewAction);
    assert.ok(ids.includes('unblock'));
    assert.ok(ids.includes('add-subtask'));
    assert.ok(ids.includes('postpone-tomorrow'));
    assert.ok(!ids.includes('complete'));
    assert.ok(!ids.includes('block'));

    const unblock = Array.from(chips).find(
      (c) => c.dataset.overviewAction === 'unblock'
    );
    unblock.click();
    assert.equal(actions[0], 'unblock');

    const postpone = Array.from(chips).find(
      (c) => c.dataset.overviewAction === 'postpone-tomorrow'
    );
    postpone.click();
    assert.equal(actions[1], 'postpone-tomorrow');
  });

  it('shows Terminer / En attente / Sous-tâche when in progress', () => {
    const actions = [];
    const ui = PriorityUI.createOverviewField({
      progressPercent: 40,
      statusCategory: 'started',
      dueDays: 3,
      dueCountdown: 'Dans 3 jours',
      onAction(id, payload) {
        actions.push({ id, payload });
      },
    });

    const chips = ui.el.querySelectorAll('.overview-action-chip');
    const ids = Array.from(chips).map((c) => c.dataset.overviewAction);
    assert.deepEqual(ids, ['complete', 'add-subtask', 'block']);
    assert.equal(ui.el.querySelector('.overview-actions').hidden, false);

    chips[0].click();
    assert.equal(actions[0].id, 'complete');

    // En attente opens composer; picking a suggestion emits block.
    const blockChip = Array.from(chips).find(
      (c) => c.dataset.overviewAction === 'block'
    );
    assert.ok(blockChip);
    blockChip.click();
    const suggestion = ui.el.querySelector('.overview-composer-chip');
    assert.ok(suggestion);
    suggestion.click();
    assert.equal(actions[1].id, 'block');
    assert.ok(Array.isArray(actions[1].payload.reasons));
    assert.ok(actions[1].payload.reasons.length >= 1);
  });

  it('add-subtask composer emits onAction with text', () => {
    const actions = [];
    const ui = PriorityUI.createOverviewField({
      progressPercent: 10,
      onAction(id, payload) {
        actions.push({ id, payload });
      },
    });
    const addBtn = Array.from(
      ui.el.querySelectorAll('.overview-action-chip')
    ).find((c) => c.dataset.overviewAction === 'add-subtask');
    assert.ok(addBtn);
    addBtn.click();
    const input = ui.el.querySelector('.overview-composer-input');
    assert.ok(input);
    input.value = 'Nouvelle étape';
    const submit = Array.from(
      ui.el.querySelectorAll('.overview-composer .overview-action-chip')
    ).find((c) => /Ajouter/i.test(c.textContent));
    assert.ok(submit);
    submit.click();
    assert.equal(actions[0].id, 'add-subtask');
    assert.equal(actions[0].payload.text, 'Nouvelle étape');
  });

  it('toggle-task checkbox emits onAction', () => {
    const actions = [];
    const ui = PriorityUI.createOverviewField({
      progressPercent: 20,
      tasks: [{ id: 'task-1', text: 'Faire X', done: false, blocked: false }],
      tasksDone: 0,
      tasksTotal: 1,
      onAction(id, payload) {
        actions.push({ id, payload });
      },
    });
    const check = ui.el.querySelector('.overview-task-check');
    assert.ok(check);
    check.click();
    assert.equal(actions[0].id, 'toggle-task');
    assert.equal(actions[0].payload.id, 'task-1');
  });

  it('shows Reporter chip when overdue', () => {
    const ui = PriorityUI.createOverviewField({
      dueCountdown: 'En retard de 1 jour',
      dueDays: -1,
      dueBand: 'overdue',
    });
    const chips = ui.el.querySelectorAll('.overview-action-chip');
    const ids = Array.from(chips).map((c) => c.dataset.overviewAction);
    assert.ok(ids.includes('postpone-tomorrow'));
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

    const fromStatut = PriorityUI.buildProgressSummaryNode({
      progressPercent: 0,
      statusCategory: 'completed',
      progressColor: '#22a06b',
    });
    assert.match(
      fromStatut.querySelector('.overview-progress-pct').textContent,
      /100/
    );
    assert.equal(
      fromStatut.querySelector('.overview-progress-fill').style.width,
      '100%'
    );
    assert.ok(
      fromStatut.querySelector('.overview-progress-ring').classList.contains(
        'is-checked'
      )
    );
  });

  it('createOverviewField compact mode skips accordion chrome and actions', () => {
    const jumps = [];
    const ui = PriorityUI.createOverviewField({
      title: 'Card back',
      compact: true,
      progressPercent: 40,
      dueCountdown: 'Dans 2 jours',
      dueBand: 'soon',
      priorityLabel: 'Importante',
      priorityColor: '#0c66e4',
      blockedReasons: ["En attente d'une réponse"],
      statusCategory: 'blocked',
      progressBlocked: true,
      tasks: [{ id: 'x', text: 'Attendre le retour', done: false, blocked: true }],
      tasksDone: 0,
      tasksTotal: 1,
      onJump(key) {
        jumps.push(key);
      },
    });

    assert.equal(ui.compact, true);
    assert.ok(ui.el.classList.contains('variant-overview-section--compact'));
    assert.ok(ui.field.classList.contains('field--overview-compact'));
    assert.equal(ui.el.querySelector('.section-toggle-head'), null);
    assert.equal(ui.el.querySelector('.overview-actions'), null);
    assert.equal(ui.el.querySelector('.overview-title-chevron'), null);
    assert.equal(ui.el.querySelector('.overview-title-text').textContent, 'Card back');
    assert.ok(ui.el.querySelector('.overview-hero'));
    assert.ok(ui.el.querySelector('.overview-motifs'));
    assert.match(
      ui.el.querySelector('.overview-task-text').textContent,
      /Attendre/
    );
    assert.equal(
      ui.el.querySelector('.overview-cell--due .overview-cell-value').textContent,
      'Dans 2 jours'
    );
    const check = ui.el.querySelector('.overview-task-check');
    assert.ok(check);
    assert.equal(check.disabled, true);

    ui.el.querySelector('.overview-title').click();
    assert.deepEqual(jumps, ['info']);
    assert.equal(ui.isExpanded(), true);
  });

  it('buildOverviewEnrichment derives tasks, motifs, and summary', () => {
    assert.equal(typeof PriorityUI.buildOverviewEnrichment, 'function');
    const enrichment = PriorityUI.buildOverviewEnrichment(
      {
        items: [
          { id: '1', text: 'Done task', done: true, progress: 100 },
          { id: '2', text: 'Open task', done: false, progress: 0 },
          {
            id: '3',
            text: 'Blocked task',
            done: false,
            progress: 0,
            blocked: true,
            blockedReasons: ['En attente client'],
          },
        ],
      },
      {
        progressPercent: 33,
        progressBlocked: true,
        statusCategory: 'blocked',
      }
    );
    assert.equal(enrichment.tasksDone, 1);
    assert.equal(enrichment.tasksTotal, 3);
    assert.equal(enrichment.tasks.length, 2);
    assert.ok(enrichment.blockedReasons.some((r) => /client/i.test(r)));
    assert.ok(enrichment.summaryText);
  });
});
