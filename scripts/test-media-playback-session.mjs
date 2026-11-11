import assert from 'node:assert/strict';
import {
  buildSessionClockUpdate,
  groupActiveMediaOutputs,
  getExpectedMediaPosition,
  getMediaPlaybackPosition,
  getMediaSessionKey,
  isMediaPlaybackComplete,
  isSameMedia,
} from '../src/utils/mediaPlaybackSession.js';

const base = {
  active: true,
  mediaKey: 'video-a',
  url: 'https://example.test/video-a.mp4',
  sessionId: 'session-a',
  positionSec: 12,
  anchorAt: 1_000,
  syncVersion: 4,
  playing: true,
};

assert.equal(getMediaSessionKey(base), 'session-a');
assert.equal(getMediaSessionKey({ mediaKey: 'legacy-video' }), 'legacy:legacy-video');
assert.equal(getExpectedMediaPosition(base, 31_000), 42);
assert.equal(getExpectedMediaPosition({ ...base, playing: false }, 31_000), 12);
assert.equal(getMediaPlaybackPosition(base, 30, 31_000), 30);
assert.equal(isMediaPlaybackComplete(base, 30, 31_000), true);
assert.equal(getMediaPlaybackPosition({ ...base, loop: true }, 30, 31_000), 12);
assert.equal(isMediaPlaybackComplete({ ...base, loop: true }, 30, 31_000), false);
assert.equal(isSameMedia(base, { mediaKey: 'video-a' }), true);
assert.equal(isSameMedia(base, { mediaKey: 'video-b' }), false);

const separateSessions = groupActiveMediaOutputs({
  projector: base,
  singers: { ...base, mediaKey: 'video-b', url: 'https://example.test/video-b.mp4', sessionId: 'session-b', positionSec: 4 },
});
assert.deepEqual(Object.keys(separateSessions).sort(), ['session-a', 'session-b']);
assert.equal(separateSessions['session-a'].outputs[0].targetId, 'projector');
assert.equal(separateSessions['session-b'].outputs[0].targetId, 'singers');
assert.equal(separateSessions['session-a'].state.loop === true, false);
assert.equal(separateSessions['session-b'].state.loop === true, false);

const sharedLoopSession = groupActiveMediaOutputs({
  projector: { ...base, loop: true },
  singers: { ...base, loop: true, volume: 0 },
  musicians: { ...base, mediaKey: 'video-c', url: 'https://example.test/video-c.mp4', sessionId: 'session-c', loop: false },
});
assert.equal(sharedLoopSession['session-a'].outputs.length, 2);
assert.equal(sharedLoopSession['session-a'].state.loop, true);
assert.equal(sharedLoopSession['session-c'].state.loop, false);

const joiningTarget = { ...base, volume: 0 };
assert.equal(getExpectedMediaPosition(joiningTarget, 43_000), 54);

const paused = buildSessionClockUpdate(base, 'pause', 31_000);
assert.deepEqual(paused, { positionSec: 42, anchorAt: 31_000, syncVersion: 5, playing: false });
const resumed = buildSessionClockUpdate(paused, 'play', 50_000);
assert.deepEqual(resumed, { positionSec: 42, anchorAt: 50_000, syncVersion: 6, playing: true });
assert.deepEqual(buildSessionClockUpdate(base, 'back10', 31_000), {
  positionSec: 32, anchorAt: 31_000, syncVersion: 5, playing: true,
});
assert.deepEqual(buildSessionClockUpdate(base, 'start', 31_000), {
  positionSec: 0, anchorAt: 31_000, syncVersion: 5, playing: true,
});

console.log('media playback session tests passed');
