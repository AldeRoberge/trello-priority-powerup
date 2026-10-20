'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent } = require('./helpers/load');

loadComponent('docs/docs-model.js');
const UI = loadComponent('dashboard/triage-ui.js').TriageUI;
const CF = loadComponent('shared/card-fields.js').CardFields;

test('appendImage stores a short upload pointer and refuses a data url', () => {
  assert.equal(UI.appendImage('', 'Plan', 'upload:card1/att1/plan.png'), '![Plan](upload:card1/att1/plan.png)');
  assert.equal(UI.appendImage('note', 'x', 'data:image/png;base64,aaaa'), 'note');
});

test('appendLine keeps a picture on its own line', () => {
  assert.equal(
    UI.appendLine('Bonjour', '![a](https://example.com/a.png)'),
    'Bonjour\n![a](https://example.com/a.png)'
  );
  assert.equal(UI.appendLine('', ''), '');
});

test('descBlocks separates text and pictures', () => {
  const blocks = UI.descBlocks('Bonjour\n![Plan](https://example.com/a.png)\n\nSuite');
  assert.deepEqual(blocks, [
    { type: 'text', text: 'Bonjour' },
    { type: 'image', alt: 'Plan', src: 'https://example.com/a.png' },
    { type: 'text', text: 'Suite' },
  ]);
});

test('imageFilesOf reads a clipboard image and skips other files', () => {
  const file = { type: 'image/png', name: 'a.png' };
  assert.deepEqual(UI.imageFilesOf({ files: [file], items: [] }), [file]);
  const item = { kind: 'file', type: 'image/jpeg', getAsFile: () => file };
  assert.deepEqual(UI.imageFilesOf({ files: [], items: [item] }), [file]);
  assert.deepEqual(UI.imageFilesOf({ files: [{ type: 'text/plain', name: 'a.txt' }], items: [] }), []);
});

test('imageAlt drops a generic clipboard name', () => {
  assert.equal(UI.imageAlt({ name: 'image.png' }), '');
  assert.equal(UI.imageAlt({ name: 'Station.png' }), 'Station');
});

test('noteShots keeps description attachments and ignores covers', () => {
  const shots = UI.noteShots('card1', [
    { id: 'a1', name: 'note-20.png' },
    { id: 'a2', name: 'couverture-20.png' },
    { id: 'a3', name: 'photo.png' },
    { id: 'a4', name: 'note-10.jpg' },
  ]);
  assert.deepEqual(shots.map((s) => s.src), [
    'upload:card1/a4/note-10.jpg',
    'upload:card1/a1/note-20.png',
  ]);
});

test('insertLines puts a picture on its own line at the caret', () => {
  const mid = CF.insertLines('Bonjour', 7, 7, ['![a](https://example.com/a.png)']);
  assert.equal(mid.text, 'Bonjour\n![a](https://example.com/a.png)');
  assert.equal(mid.start, mid.text.length);
  const empty = CF.insertLines('', 0, 0, ['![](https://example.com/a.png)']);
  assert.equal(empty.text, '![](https://example.com/a.png)');
});
