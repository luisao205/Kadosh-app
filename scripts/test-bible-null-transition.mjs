import assert from 'node:assert/strict';
import { resolveActiveBibleProjectorState, resolveActiveBibleSlide } from '../src/utils/bibleProjectionState.js';

const bible = {
  type: 'preaching',
  contentType: 'bible',
  reference: 'Juan 3:16',
  content: 'Texto biblico',
  bible: { slides: [{ reference: 'Juan 3:16', text: 'Texto biblico' }], slideIndex: 0 }
};
const states = [
  null,
  { projectorState: bible },
  null,
  { projectorState: { type: 'lyrics' } },
  { projectorState: { type: 'media' } },
  { projectorState: { type: 'preaching', contentType: 'preaching' } },
  { proyectorApagado: true, projectorState: bible },
  { proyectorApagado: false, projectorState: bible }
];

const resolved = states.map(resolveActiveBibleProjectorState);
assert.deepEqual(resolved.map(Boolean), [false, true, false, false, false, false, false, true]);
assert.equal(resolveActiveBibleSlide(resolved[1]).text, 'Texto biblico');
assert.equal(resolveActiveBibleSlide(resolved[0]), null);
console.log('bible null and first-snapshot transitions: OK');
