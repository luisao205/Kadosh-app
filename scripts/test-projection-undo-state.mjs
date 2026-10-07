import assert from 'node:assert/strict';
import { shouldUseLegacyCanvaFallback } from '../src/utils/canvaProjectionStrategy.js';
import {
  ABSENT,
  createProjectionUndoOperation,
  matchingCanvaMemoryDeltas,
  matchingFieldDeltas,
  matchingRouteDeltas,
  restoreCanvaMemoryDeltas,
  restoreFieldDeltas,
  restoreRouteDeltas,
} from '../src/utils/projectionUndoState.js';

const deleteMarker = Symbol('delete');
const song = { type: 'lyrics', contentType: 'lyrics', title: 'Coro 3' };
const bible = { type: 'preaching', contentType: 'bible', reference: 'Juan 11:35' };
const quickMessage = { type: 'preaching', contentType: 'quickMessage', title: 'Bienvenidos' };
const canva = { active: true, presentationId: 'canva-1', title: 'Canva A', page: 4 };
const video = { active: true, mediaId: 'video-1', url: 'https://example.test/video.mp4', type: 'video' };

const createOperation = (options) => createProjectionUndoOperation({
  action: 'test',
  changedFields: ['projectorState', 'liveState', 'optional'],
  ...options,
});

// A: only fields changed by the operation are retained.
const beforeSong = {
  projectorState: { type: 'canva', title: 'Canva A' },
  liveState: { activeContentType: 'canva', activeContentTitle: 'Canva A' },
  untouched: 'same',
  canvaOutputs: { projector: canva, singers: { ...canva, presentationId: 'canva-singers' } },
  mediaOutputs: { musicians: video },
};
const afterSong = {
  ...beforeSong,
  projectorState: song,
  liveState: { activeContentType: 'lyrics', activeContentTitle: 'Coro 3' },
  canvaOutputs: { singers: beforeSong.canvaOutputs.singers },
};
const songUndo = createOperation({ beforeEvent: beforeSong, afterEvent: afterSong, targetIds: ['projector'] });
assert.deepEqual(Object.keys(songUndo.fields).sort(), ['liveState', 'projectorState']);
assert.deepEqual(Object.keys(songUndo.routes), ['projector']);
assert.equal(songUndo.routes.projector.canva.before.presentationId, 'canva-1');
assert.equal(songUndo.routes.projector.media, undefined);

// B/C: CAS restores only pieces that still contain this operation's expected result.
assert.deepEqual(Object.keys(matchingFieldDeltas(afterSong, songUndo.fields)).sort(), ['liveState', 'projectorState']);
const concurrentContent = { ...afterSong, projectorState: bible };
assert.deepEqual(Object.keys(matchingFieldDeltas(concurrentContent, songUndo.fields)), ['liveState']);
assert.deepEqual(restoreFieldDeltas(matchingFieldDeltas(concurrentContent, songUndo.fields), () => deleteMarker), {
  liveState: beforeSong.liveState,
});

// D/E: route restoration is per destination and keeps unrelated destinations untouched.
const restoredSongRoutes = restoreRouteDeltas(afterSong, matchingRouteDeltas(afterSong, songUndo.routes));
assert.deepEqual(restoredSongRoutes.canvaOutputs, beforeSong.canvaOutputs);
assert.deepEqual(restoredSongRoutes.mediaOutputs, beforeSong.mediaOutputs);
assert.equal(songUndo.fields.optional, undefined);

// F: a failed write does not replace the last successful operation.
let committedUndo = songUndo;
const failedCandidate = createOperation({ beforeEvent: afterSong, afterEvent: { ...afterSong, projectorState: bible }, targetIds: ['projector'] });
const commitAfterWrite = (candidate, succeeded) => {
  if (succeeded) committedUndo = candidate;
};
commitAfterWrite(failedCandidate, false);
assert.equal(committedUndo, songUndo);

// G: the next successful operation replaces the previous one instead of stacking history.
const quickUndo = createOperation({
  action: 'quick-message',
  beforeEvent: afterSong,
  afterEvent: { ...afterSong, projectorState: quickMessage },
  targetIds: ['projector'],
});
commitAfterWrite(quickUndo, true);
assert.equal(committedUndo, quickUndo);

// H: concurrent work on one destination is skipped without discarding another matching destination.
const beforeTargets = {
  projectorState: song,
  canvaOutputs: { singers: canva },
  mediaOutputs: { musicians: video },
};
const afterTargets = { ...beforeTargets, projectorState: quickMessage, canvaOutputs: {}, mediaOutputs: {} };
const targetsUndo = createOperation({
  beforeEvent: beforeTargets,
  afterEvent: afterTargets,
  targetIds: ['singers', 'musicians'],
});
const concurrentTargets = {
  ...afterTargets,
  canvaOutputs: { singers: { ...canva, presentationId: 'canva-other' } },
};
assert.deepEqual(Object.keys(matchingRouteDeltas(concurrentTargets, targetsUndo.routes)), ['musicians']);
assert.deepEqual(restoreRouteDeltas(concurrentTargets, matchingRouteDeltas(concurrentTargets, targetsUndo.routes)), {
  canvaOutputs: concurrentTargets.canvaOutputs,
  mediaOutputs: beforeTargets.mediaOutputs,
});

// I: absent, null, and Canva page memory retain their distinct semantics.
const beforeOptional = { canvaPageMemory: { projector: { 'canva-1': 4 } } };
const afterOptional = { optional: null, canvaPageMemory: { projector: { 'canva-1': 8 } } };
const optionalUndo = createOperation({
  beforeEvent: beforeOptional,
  afterEvent: afterOptional,
  canvaMemoryKeys: { projector: 'canva-1' },
});
assert.equal(optionalUndo.fields.optional.before, ABSENT);
assert.equal(optionalUndo.fields.optional.expectedAfter, null);
assert.deepEqual(restoreFieldDeltas(matchingFieldDeltas(afterOptional, optionalUndo.fields), () => deleteMarker), {
  optional: deleteMarker,
});
assert.deepEqual(restoreCanvaMemoryDeltas(afterOptional, matchingCanvaMemoryDeltas(afterOptional, optionalUndo.canvaMemory)), {
  projector: { 'canva-1': 4 },
});

assert.equal(shouldUseLegacyCanvaFallback({ ok: false, code: 'LEGACY_CANVA_ACTIVE' }), true);
assert.equal(shouldUseLegacyCanvaFallback({ ok: false, code: 'permission-denied' }), false);
assert.equal(shouldUseLegacyCanvaFallback({ ok: false, code: 'unavailable' }), false);
assert.equal(shouldUseLegacyCanvaFallback(undefined), false);

console.log('projection undo state: OK');
