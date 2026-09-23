import assert from 'node:assert/strict';
import {
  addQuickMessageHistoryEntry,
  clearQuickMessageHistory,
  createQuickMessageHistoryId,
  replaceQuickMessageHistoryEntry,
  removeQuickMessageHistoryEntry
} from '../src/utils/quickMessageHistory.js';

const first = { presentationType: 'point', content: 'Primer punto', segments: [{ text: 'Primer punto', color: 'white', bold: true }] };
const second = { presentationType: 'phrase', content: 'Segundo punto', segments: [{ text: 'Segundo punto', color: 'blue', bold: true }] };

let history = addQuickMessageHistoryEntry([], first, 'first');
history = addQuickMessageHistoryEntry(history, second, 'second');
assert.deepEqual(history.map((entry) => entry.id), ['second', 'first']);

const afterDelete = removeQuickMessageHistoryEntry(history, 'first');
assert.deepEqual(afterDelete.map((entry) => entry.id), ['second']);
assert.equal(afterDelete[0].content, 'Segundo punto');

const afterReplay = addQuickMessageHistoryEntry(history, first, 'first-replayed');
assert.deepEqual(afterReplay.map((entry) => entry.id), ['first-replayed', 'second']);
assert.equal(afterReplay.filter((entry) => entry.content === first.content).length, 1);

const edited = { presentationType: 'title', content: 'Punto editado', segments: [{ text: 'Punto ', color: 'blue', bold: true }, { text: 'editado', color: 'red', bold: false }] };
const afterEdit = replaceQuickMessageHistoryEntry(history, 'second', edited);
assert.equal(afterEdit.length, history.length);
assert.equal(afterEdit[0].id, 'second');
assert.equal(afterEdit[0].presentationType, 'title');
assert.deepEqual(afterEdit[0].segments, edited.segments);
assert.equal(afterEdit.some((entry) => entry.id === 'second' && entry.content === 'Segundo punto'), false);

const generatedId = createQuickMessageHistoryId();
assert.equal(typeof generatedId, 'string');
assert.ok(generatedId.length > 0);

assert.deepEqual(clearQuickMessageHistory(), []);
console.log('quick message history behavior: OK');
