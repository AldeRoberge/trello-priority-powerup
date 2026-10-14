'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent } = require('./helpers/load');

function el(opts) {
  opts = opts || {};
  const classes = opts.classes || [];
  const attrs = opts.attrs || {};
  return {
    tagName: opts.tag || '',
    className: classes.join(' '),
    classList: { contains: (name) => classes.indexOf(name) >= 0 },
    getAttribute: (name) => (attrs[name] != null ? attrs[name] : null),
    closest: (sel) => (opts.closest && opts.closest[sel] ? opts.closest[sel] : null),
    type: opts.type || '',
    disabled: !!opts.disabled,
    readOnly: !!opts.readOnly,
    isContentEditable: !!opts.editable,
  };
}

describe('AiComplete', () => {
  let AI;
  before(() => {
    loadComponent('shared/ai-complete.js');
    AI = global.AiComplete;
    assert.ok(AI);
  });

  describe('classifyField', () => {
    it('recognizes documents, names and labels', () => {
      assert.equal(AI.classifyField(el({ classes: ['dc-editor'], editable: true })), 'document');
      assert.equal(AI.classifyField(el({ classes: ['dc-title'] })), 'doc-name');
      assert.equal(AI.classifyField(el({ classes: ['nc-title'] })), 'task-name');
      assert.equal(AI.classifyField(el({ classes: ['info-title-input'] })), 'task-name');
      assert.equal(AI.classifyField(el({ classes: ['gantt-rename-input'] })), 'task-name');
      assert.equal(AI.classifyField(el({ classes: ['cq-title-input'] })), 'task-name');
      assert.equal(AI.classifyField(el({ classes: ['db-capture'], editable: true })), 'task-name');
      assert.equal(
        AI.classifyField(el({ classes: ['tb-input'], closest: { 'td[data-key="name"]': {} } })),
        'task-name'
      );
      assert.equal(AI.classifyField(el({ classes: ['tb-input'] })), '');
      assert.equal(AI.classifyField(el({ attrs: { id: 'peopleEditName' } })), 'person-name');
      assert.equal(AI.classifyField(el({ classes: ['tg-editor-label'] })), 'person-name');
      assert.equal(AI.classifyField(el({ classes: ['dc-people-input'] })), 'person-name');
      assert.equal(AI.classifyField(el({ classes: ['info-labels-search'], type: 'search' })), 'tag');
      assert.equal(AI.classifyField(el({ classes: ['info-labels-color-picker-name-input'] })), 'tag');
      assert.equal(AI.classifyField(el({ classes: ['dc-tag-input'] })), 'tag');
      assert.equal(
        AI.classifyField(el({ closest: { '.dc-tags, [data-dc-field="tags"]': {} } })),
        'tag'
      );
      assert.equal(AI.classifyField(el({ attrs: { 'data-ai-kind': 'document' } })), 'document');
      assert.equal(AI.classifyField(el({ classes: ['en-name'] })), 'name');
    });

    it('completes any other text you are writing', () => {
      assert.equal(AI.classifyField(el({ tag: 'TEXTAREA', classes: ['info-desc-input'] })), 'text');
      assert.equal(AI.classifyField(el({ tag: 'TEXTAREA', classes: ['cf-textarea'] })), 'text');
      assert.equal(AI.classifyField(el({ tag: 'TEXTAREA', classes: ['kb-add-input'] })), 'task-name');
      assert.equal(AI.classifyField(el({ tag: 'INPUT', classes: ['tb-add'] })), 'task-name');
      assert.equal(AI.classifyField(el({ tag: 'INPUT', classes: ['db-add-input'], attrs: { 'aria-label': 'Nouvelle tâche' } })), 'task-name');
      assert.equal(AI.classifyField(el({ tag: 'INPUT', classes: ['blocked-reason-input'] })), 'text');
      assert.equal(AI.classifyField(el({ tag: 'TEXTAREA', classes: ['tb-input'], closest: { 'td[data-key="desc"]': {} } })), 'text');
      assert.equal(AI.classifyField(el({ tag: 'INPUT', attrs: { 'aria-label': 'Nom du composant' } })), 'name');
      assert.equal(AI.classifyField(el({ tag: 'INPUT', attrs: { placeholder: 'Décrire une règle…' } })), 'text');
      assert.equal(AI.classifyField(el({ tag: 'INPUT', attrs: { id: 'settingsProfileDisplayName' } })), 'person-name');
      assert.equal(AI.classifyField(el({ editable: true, attrs: { 'aria-label': 'Notes' } })), 'text');
      assert.equal(AI.classifyField(el({ tag: 'INPUT', editable: true, classes: ['memory-ui-input'] })), '');
      assert.equal(AI.classifyField(el({ tag: 'INPUT', classes: ['kb-ai-input'] })), '');
      assert.equal(AI.classifyField(el({ tag: 'INPUT', attrs: { placeholder: 'Chercher un genre…' } })), '');
      assert.equal(AI.classifyField(el({ tag: 'INPUT', type: 'url', attrs: { placeholder: 'https://…' } })), '');
    });

    it('leaves search, passwords and the assistant composer alone', () => {
      assert.equal(AI.classifyField(el({ classes: ['dc-search-input'], type: 'search' })), '');
      assert.equal(AI.classifyField(el({ type: 'password' })), '');
      assert.equal(AI.classifyField(el({ classes: ['agent-composer-input'] })), '');
      assert.equal(AI.classifyField(el({ classes: ['dc-title'], attrs: { 'data-ai': 'off' } })), '');
      assert.equal(AI.classifyField(el({ classes: ['dc-title'], disabled: true })), '');
      assert.equal(AI.classifyField(el({ classes: ['kb-ai-input'], tag: 'INPUT' })), '');
      assert.equal(AI.classifyField(el({ classes: ['memory-ui-input'], editable: true })), '');
      assert.equal(AI.classifyField(el({ tag: 'INPUT', attrs: { placeholder: 'Chercher un genre…' } })), '');
      assert.equal(AI.classifyField(el({ tag: 'INPUT', type: 'url', attrs: { placeholder: 'https://…' } })), '');
      assert.equal(AI.classifyField(el({ tag: 'SELECT', classes: ['en-input'] })), '');
    });
  });

  describe('shouldRequest', () => {
    it('waits for a real start and stays out of mentions', () => {
      assert.equal(AI.shouldRequest({ kind: 'document', lineBefore: 'Bon', lineAfter: '' }), false);
      assert.equal(AI.shouldRequest({ kind: 'document', lineBefore: 'Bonjour', lineAfter: '' }), true);
      assert.equal(AI.shouldRequest({ kind: 'document', lineBefore: 'Bonjour ', lineAfter: 'suite' }), false);
      assert.equal(AI.shouldRequest({ kind: 'document', lineBefore: 'Voir @Mar', lineAfter: '' }), false);
      assert.equal(AI.shouldRequest({ kind: 'document', lineBefore: 'Bonjour', lineAfter: '', menuOpen: true }), false);
      assert.equal(AI.shouldRequest({ kind: 'task-name', lineBefore: 'P', lineAfter: '' }), false);
      assert.equal(AI.shouldRequest({ kind: 'task-name', lineBefore: 'Pré', lineAfter: '' }), true);
      assert.equal(AI.shouldRequest({ kind: 'text', lineBefore: 'Bon', lineAfter: '' }), false);
      assert.equal(AI.shouldRequest({ kind: 'text', lineBefore: 'Bonjour', lineAfter: '' }), true);
      assert.equal(AI.shouldRequest({ kind: 'tag', lineBefore: 'Ur', lineAfter: '' }), true);
      assert.equal(AI.shouldRequest(null), false);
    });
  });

  describe('parseCompletion', () => {
    it('keeps a leading space when the word is finished', () => {
      assert.equal(AI.parseCompletion(' de la semaine', 'Préparer', 'task-name'), ' de la semaine');
      assert.equal(AI.parseCompletion('  de la semaine', 'Préparer ', 'task-name'), 'de la semaine');
    });

    it('joins a word that is not finished', () => {
      assert.equal(AI.parseCompletion('rer la réunion', 'Prépa', 'task-name'), 'rer la réunion');
    });

    it('drops an echoed prefix, quotes and empty answers', () => {
      assert.equal(AI.parseCompletion('Préparer la réunion', 'Préparer', 'task-name'), ' la réunion');
      assert.equal(AI.parseCompletion('"la suite"', 'Bonjour ', 'document'), 'la suite');
      assert.equal(AI.parseCompletion('.', 'Bonjour ', 'document'), '');
      assert.equal(AI.parseCompletion('Aucun', 'Bonjour ', 'document'), '');
      assert.equal(AI.parseCompletion('{"text":" demain"}', 'Réunion', 'doc-name'), ' demain');
      assert.equal(AI.parseCompletion('Voici une idée', 'Bonjour ', 'document'), '');
    });

    it('caps a long label', () => {
      const raw = 'un deux trois quatre cinq';
      assert.equal(AI.parseCompletion(raw, 'x ', 'tag'), 'un deux trois');
    });

    it('drops a reply that answers the sentence', () => {
      assert.equal(AI.parseCompletion(' answer?', 'What is 1+1? The', 'document'), '');
      assert.equal(AI.parseCompletion('réponse : 2', 'Combien font 1+1? ', 'document'), '');
    });

    it('separates a new word and drops a different story', () => {
      assert.equal(
        AI.parseCompletion('and C++', 'The best programming language in the world is C', 'document'),
        ' and C++'
      );
      assert.equal(AI.parseCompletion('de la semaine', 'Préparer', 'task-name'), ' de la semaine');
      assert.equal(
        AI.parseCompletion(
          'and on the seventh day, he rested and',
          'The best programming language in the world is C',
          'document'
        ),
        ''
      );
      assert.equal(
        AI.parseCompletion(
          ' because it is close to the machine',
          'The best programming language in the world is C',
          'document'
        ),
        ' because it is close to the machine'
      );
      assert.equal(
        AI.parseCompletion(
          'et le septième jour il se reposa',
          'The best programming language in the world is C',
          'document'
        ),
        ''
      );
    });
  });

  describe('buildMessages', () => {
    it('puts the caret text and the board names in the prompt', () => {
      const messages = AI.buildMessages(
        { kind: 'document', prefix: 'La réunion de', lineAfter: '' },
        { tasks: ['Préparer la réunion'], people: ['Marie Tremblay'], docs: [], tags: ['Urgent'] }
      );
      assert.equal(messages[0].role, 'system');
      assert.match(messages[1].content, /La réunion de/);
      assert.match(messages[1].content, /Marie Tremblay/);
      assert.match(messages[1].content, /Préparer la réunion/);
      assert.match(messages[1].content, /Urgent/);
      assert.equal(messages[0].content.indexOf('\u2014'), -1);
      assert.match(messages[0].content, /ne réponds pas à une question/);
      assert.match(messages[0].content, /4 suites/);
      assert.match(messages[0].content, /même sujet/);
      assert.match(messages[0].content, /la plus probable/);
      assert.equal(messages[0].content.indexOf('directions différentes'), -1);
    });
  });

  describe('parseBranches', () => {
    it('keeps four different continuations and drops the rest', () => {
      const raw = [
        ' demain matin',
        ' aujourd\'hui',
        ' avec Marie',
        ' plus tard',
        ' cinquième ignorée'
      ].join('\n');
      const branches = AI.parseBranches(raw, 'Réunion', 'document');
      assert.equal(branches.length, 4);
      assert.equal(branches[0], ' demain matin');
      assert.equal(branches[2], ' avec Marie');
    });
  });

  describe('matchBranch', () => {
    const branches = [' tomorrow morning', ' today', ' with Marie'];

    it('keeps the first branch while the letters still match it', () => {
      assert.equal(AI.matchBranch(branches, ''), ' tomorrow morning');
      assert.equal(AI.matchBranch(branches, ' t'), 'omorrow morning');
      assert.equal(AI.matchBranch(branches, ' to'), 'morrow morning');
    });

    it('switches branch when the letters leave the first one', () => {
      assert.equal(AI.matchBranch(branches, ' tod'), 'ay');
      assert.equal(AI.matchBranch(branches, ' w'), 'ith Marie');
    });

    it('is empty when the letters match nothing, or the branch is finished', () => {
      assert.equal(AI.matchBranch(branches, ' x'), '');
      assert.equal(AI.matchBranch(branches, ' tomorrow morning'), '');
    });
  });
});
