import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const fixture = JSON.parse(await readFile(new URL('../test-data/preaching/prueba-sistema-predicacion.json', import.meta.url), 'utf8'));
const { event, preaching, ids } = fixture;

assert.equal(ids.eventId, preaching.eventId);
assert.equal(ids.preachingId, event.predicaId);
assert.equal(event.predicaTitle, preaching.title);
assert.equal(event.predicadorNombre, preaching.preacherName);
assert.equal(event.estado, 'programado');
assert.equal(event.completado, false);
assert.equal(preaching.preacherType, 'external');
assert.equal(preaching.preacherId, null);
assert.equal(preaching.status, 'ready');
assert.ok(/^PRUEBA SISTEMA/.test(event.titulo));
assert.ok(/^PRUEBA SISTEMA/.test(preaching.title));

const allowedTypes = new Set(['point', 'subpoint', 'verse', 'note', 'mediaInstruction']);
assert.ok(preaching.blocks.length >= 20);
preaching.blocks.forEach((block, index) => {
  assert.ok(block.id);
  assert.ok(allowedTypes.has(block.type));
  assert.equal(block.order, index);
});

const points = preaching.blocks.filter(block => block.type === 'point');
const verses = preaching.blocks.filter(block => block.type === 'verse');
assert.deepEqual(points.map(block => block.title), [
  'INTRODUCCION',
  'PUNTO 1 - LA FE',
  'PUNTO 2 - LA CONFIANZA',
  'PUNTO 3 - LA VICTORIA',
  'CONCLUSION'
]);
assert.equal(verses.length, 10);
assert.ok(verses.every(block => block.reference && block.translation === 'RVR1960' && block.text));
assert.ok(preaching.blocks.some(block => block.type === 'note' && block.visibility === 'shared'));
assert.ok(preaching.blocks.some(block => block.type === 'mediaInstruction' && !block.mediaId));

console.log('preaching test fixture contract: OK');
