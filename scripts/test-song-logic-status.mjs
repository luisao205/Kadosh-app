import assert from 'node:assert/strict';
import { getSongLogicStatus, SONG_LOGIC_STATUS } from '../src/utils/songLogicStatus.js';

const validParts = [
  { songId: 'a', originalKey: 'F#', materializedKey: 'E' },
  { songId: 'b', originalKey: 'A', materializedKey: 'E' },
];

assert.equal(getSongLogicStatus({ titulo: 'Normal' }), SONG_LOGIC_STATUS.CURRENT);
assert.equal(getSongLogicStatus({ medleyConfig: { songs: validParts, sectionPartIndexes: [0, 1], transposeMode: 'UNIFIED', unifiedKey: 'E' } }), SONG_LOGIC_STATUS.LEGACY);
assert.equal(getSongLogicStatus({ medleyConfig: { songs: [{ songId: 'legacy-a', originalKey: 'F#', medleyKey: 'E' }], transposeMode: 'UNIFIED', unifiedKey: 'E' } }), SONG_LOGIC_STATUS.LEGACY);
assert.equal(getSongLogicStatus({ medleyConfig: { materializationVersion: 2, songs: validParts, sectionPartIndexes: [0, 1], transposeMode: 'UNIFIED', unifiedKey: 'E' } }), SONG_LOGIC_STATUS.CURRENT);
assert.equal(getSongLogicStatus({ medleyConfig: { materializationVersion: 2, songs: validParts, transposeMode: 'UNIFIED', unifiedKey: 'E' } }), SONG_LOGIC_STATUS.NEEDS_REPAIR);
assert.equal(getSongLogicStatus({ medleyConfig: { materializationVersion: 2, songs: [{ ...validParts[0] }, { ...validParts[1], materializedKey: 'A' }], sectionPartIndexes: [0, 1], transposeMode: 'UNIFIED', unifiedKey: 'E' } }), SONG_LOGIC_STATUS.NEEDS_REPAIR);
assert.equal(getSongLogicStatus({ medleyConfig: { materializationVersion: 2, songs: validParts, sectionPartIndexes: [0, 3] } }), SONG_LOGIC_STATUS.NEEDS_REPAIR);
assert.equal(getSongLogicStatus({ medleyConfig: { materializationVersion: 2, manualEdited: true, songs: validParts, sectionPartIndexes: [0, 1] } }), SONG_LOGIC_STATUS.NEEDS_REPAIR);

console.log('song logic status contract: OK');
