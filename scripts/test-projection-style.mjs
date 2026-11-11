import assert from 'node:assert/strict';
import {
  DEFAULT_PROJECTION_STYLE,
  PROJECTION_TRANSITIONS,
  normalizeProjectionStyle,
  normalizeProjectionTransition,
  resolveProjectionStyle,
} from '../src/utils/projectionStyle.js';

assert.deepEqual(PROJECTION_TRANSITIONS, ['fade', 'slide', 'zoom', 'none']);
for (const transition of PROJECTION_TRANSITIONS) {
  assert.equal(normalizeProjectionTransition(transition), transition);
}
assert.equal(normalizeProjectionTransition('unsupported'), 'fade');

const song = {
  id: 'song-v2',
  projectionStyle: { preset: 'cinematic', motion: 'soft', alignment: 'center', backgroundTreatment: 'auto' }
};

assert.deepEqual(normalizeProjectionStyle(undefined), DEFAULT_PROJECTION_STYLE, 'Legacy songs must use the global clean fallback.');
assert.deepEqual(
  resolveProjectionStyle({ song, event: {} }),
  { style: song.projectionStyle, source: 'song' },
  'Song default must resolve when no event override exists.'
);

const override = { preset: 'impact', motion: 'dynamic', alignment: 'center', backgroundTreatment: 'normal' };
assert.deepEqual(
  resolveProjectionStyle({ song, event: { songProjectionStyleOverrides: { [song.id]: override } } }),
  { style: override, source: 'event' },
  'Event override must win without mutating song metadata.'
);
assert.deepEqual(song.projectionStyle, { preset: 'cinematic', motion: 'soft', alignment: 'center', backgroundTreatment: 'auto' });

assert.deepEqual(
  normalizeProjectionStyle({ preset: 'unsupported', motion: 'invalid' }),
  DEFAULT_PROJECTION_STYLE,
  'Untrusted or incomplete values must normalize to the closed fallback.'
);

console.log('projection-style contract: PASS');
