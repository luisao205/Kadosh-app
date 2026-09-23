import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  QUICK_MESSAGE_MAX_SEGMENTS,
  QUICK_MESSAGE_MAX_SEGMENT_LENGTH,
  validateQuickMessagePayload
} = require('../functions/quickMessagePayload.js');

const valid = validateQuickMessagePayload({
  eventoId: 'event-1',
  presentationType: 'phrase',
  segments: [
    { text: 'No pierdas tu bendicion', color: 'blue', bold: true },
    { text: '\npor un momento de pecado', color: 'red', bold: false }
  ]
});

assert.equal(valid.content, 'No pierdas tu bendicion\npor un momento de pecado');
assert.deepEqual(valid.segments.map((segment) => segment.color), ['blue', 'red']);
assert.throws(() => validateQuickMessagePayload({ ...valid, extra: true }));
assert.throws(() => validateQuickMessagePayload({ ...valid, segments: [{ text: 'No', color: 'purple', bold: true }] }));
assert.throws(() => validateQuickMessagePayload({ ...valid, segments: Array.from({ length: QUICK_MESSAGE_MAX_SEGMENTS + 1 }, () => ({ text: 'x', color: 'white', bold: true })) }));
assert.throws(() => validateQuickMessagePayload({ ...valid, segments: [{ text: 'x'.repeat(QUICK_MESSAGE_MAX_SEGMENT_LENGTH + 1), color: 'white', bold: true }] }));
assert.throws(() => validateQuickMessagePayload({ ...valid, segments: [{ text: 'No', color: 'white', bold: 'true' }] }));

console.log('quick message callable payload validation: OK');
