import assert from 'node:assert/strict';
import { createLyricFormattingSidecar, hashLyricsSource } from '../src/utils/lyricFormatting.js';
import {
  LYRIC_FORMATTING_PERSISTENCE_LIMITS,
  LyricFormattingPersistenceError,
  canonicalizeLyricsForPersistence,
  classifyLyricFormattingSidecar,
  computeFormattingHash,
  computeLyricsHash,
  createLyricFormattingSaveOperation,
  evaluateLyricFormattingPersistence,
  measureV21SavePayloadBytes,
  stableSerializeFormatting,
  validateV21SavePayloadSize,
  validateLyricFormattingSaveOperation,
} from '../src/utils/lyricFormattingPersistence.js';

const RAW = '# Coro 1\nMisma frase\n\nMisma frase';
const IDS = {
  sections: [{
    id: 'section:opaque-a', fingerprint: 'section-fingerprint', titleFingerprint: 'title-fingerprint',
    previousFingerprint: null, nextFingerprint: null,
    slides: [
      { id: 'slide:opaque-a', fingerprint: 'same-text', previousFingerprint: null, nextFingerprint: 'same-text' },
      { id: 'slide:opaque-b', fingerprint: 'same-text', previousFingerprint: 'same-text', nextFingerprint: null },
    ],
  }],
};
const anchor = { quote: 'Misma frase' };
const block = (id, slideId, style) => ({
  id, scope: { type: 'slide', sectionId: 'section:opaque-a', slideId },
  sourceHash: hashLyricsSource('Misma frase'),
  segments: [{ id: `${id}:segment`, anchor, style, reconciliation: 'resolved' }],
  reconciliation: 'resolved',
});
const sidecar = (blocks = []) => createLyricFormattingSidecar({ lyricsRaw: RAW, identities: IDS, blocks });
const VALID = sidecar([
  block('block:a', 'slide:opaque-a', { bold: true }),
  block('block:b', 'slide:opaque-b', { color: 'accent' }),
]);
const REQUEST_ID = 'format_request_00000001';
const SONG_ID = 'song-format-test';
const UID = 'operator-a';
const expectCode = async (code, action) => assert.rejects(action, error => error instanceof LyricFormattingPersistenceError && error.code === code);
const makeOperation = async (overrides = {}) => createLyricFormattingSaveOperation({
  songId: SONG_ID,
  requestId: REQUEST_ID,
  expectedLyricsHash: await computeLyricsHash(RAW),
  expectedFormattingHash: await computeFormattingHash(null),
  nextLyricsRaw: RAW,
  lyricFormatting: VALID,
  ...overrides,
});

// 1-4: valid, absent, legacy and invalid versions.
assert.equal(classifyLyricFormattingSidecar(VALID, { lyricsRaw: RAW }).status, 'valid');
assert.equal(classifyLyricFormattingSidecar(null, { lyricsRaw: RAW }).status, 'absent');
assert.equal(classifyLyricFormattingSidecar({ version: 0 }).status, 'legacy-unsupported');
assert.equal(classifyLyricFormattingSidecar({ ...VALID, version: 99 }, { lyricsRaw: RAW }).status, 'legacy-unsupported');

// 5-8: duplicate IDs and identical pages retain independent opaque identities and formats.
const duplicateIds = structuredClone(VALID);
duplicateIds.identities.sections[0].slides[1].id = duplicateIds.identities.sections[0].slides[0].id;
assert.equal(classifyLyricFormattingSidecar(duplicateIds, { lyricsRaw: RAW }).status, 'invalid');
assert.notEqual(IDS.sections[0].slides[0].id, IDS.sections[0].slides[1].id);
assert.notDeepEqual(VALID.blocks[0].segments[0].style, VALID.blocks[1].segments[0].style);
assert.equal(VALID.blocks[0].scope.slideId !== VALID.blocks[1].scope.slideId, true);

// 9-16: ordering, insertion, deletion, ambiguity, chords and blank-page boundaries affect lyrics SHA-256.
const reordered = '# Coro 1\nMisma frase\n\nOtra frase';
assert.notEqual(await computeLyricsHash(RAW), await computeLyricsHash(reordered));
assert.notEqual(await computeLyricsHash(RAW), await computeLyricsHash(`${RAW}\n\nNueva pantalla`));
assert.notEqual(await computeLyricsHash(RAW), await computeLyricsHash('# Coro 1\nMisma frase'));
assert.equal(classifyLyricFormattingSidecar({ ...VALID, sourceLyricsHash: hashLyricsSource(`${RAW}\nMisma frase`) }, { lyricsRaw: RAW }).status, 'stale');
const chords = '# Verso\n[C]Texto [F#m]musical';
assert.equal(canonicalizeLyricsForPersistence(chords), chords);
assert.notEqual(await computeLyricsHash('# A\nUno\n\nDos'), await computeLyricsHash('# A\nUno\nDos'));
assert.equal(canonicalizeLyricsForPersistence('A\r\nB\rC'), 'A\nB\nC');
assert.equal(canonicalizeLyricsForPersistence('Cafe\u0301'), 'Café');

// 17-19: deterministic hashes and relevant changes.
assert.equal(await computeLyricsHash(RAW), await computeLyricsHash(RAW));
assert.notEqual(await computeLyricsHash(RAW), await computeLyricsHash(`${RAW}!`));
assert.notEqual(await computeFormattingHash(VALID, { lyricsRaw: RAW }), await computeFormattingHash(sidecar([block('block:a', 'slide:opaque-a', { bold: false })]), { lyricsRaw: RAW }));

// 20-24: CAS, stale writes, atomic patch and idempotency.
const operation = await makeOperation();
assert.deepEqual(await validateLyricFormattingSaveOperation(operation), operation);
await expectCode('lyrics_conflict', () => evaluateLyricFormattingPersistence({ operation, currentSong: { id: SONG_ID, letraRaw: `${RAW}!`, lyricFormatting: null }, actorUid: UID }));
const ready = await evaluateLyricFormattingPersistence({ operation, currentSong: { id: SONG_ID, letraRaw: RAW, lyricFormatting: null }, actorUid: UID });
assert.deepEqual(Object.keys(ready.atomicPatch).sort(), ['letraRaw', 'lyricFormatting']);
assert.equal((await evaluateLyricFormattingPersistence({ operation, currentSong: { id: SONG_ID, letraRaw: RAW, lyricFormatting: null }, actorUid: UID, existingRequest: { actorUid: UID, operationFingerprint: operation.operationFingerprint } })).status, 'idempotent');
const changedRequest = { ...operation, expectedLyricsHash: '0'.repeat(64) };
await expectCode('operation_fingerprint_mismatch', () => validateLyricFormattingSaveOperation(changedRequest));

// 25-29: byte limits, segment limits, unknown properties, styles and templates.
assert.equal(LYRIC_FORMATTING_PERSISTENCE_LIMITS.maxSidecarBytes, 256 * 1024);
await expectCode('operation_too_large', () => makeOperation({ nextLyricsRaw: `# A\n${'á'.repeat(40_000)}`, lyricFormatting: null }));
const tooManySegments = structuredClone(VALID);
tooManySegments.blocks[0].segments = Array.from({ length: 129 }, (_, index) => ({ id: `segment:${index}`, anchor, style: { bold: true }, reconciliation: 'resolved' }));
assert.equal(classifyLyricFormattingSidecar(tooManySegments, { lyricsRaw: RAW }).status, 'invalid');
assert.equal(classifyLyricFormattingSidecar({ ...VALID, executable: '<script>' }, { lyricsRaw: RAW }).status, 'invalid');
const invalidStyle = structuredClone(VALID);
invalidStyle.blocks[0].segments[0].style.color = 'javascript:red';
assert.equal(classifyLyricFormattingSidecar(invalidStyle, { lyricsRaw: RAW }).status, 'invalid');
const invalidTemplate = structuredClone(VALID);
invalidTemplate.blocks[0].template = { id: 'unknown', version: 1, slots: [{ id: 'slot:a', role: 'primary', anchor }] };
assert.equal(classifyLyricFormattingSidecar(invalidTemplate, { lyricsRaw: RAW }).status, 'invalid');

// 30+: safe fallback, ownership, request reuse, formatting CAS and canonical ordering.
assert.equal(classifyLyricFormattingSidecar(undefined).status, 'absent');
await expectCode('request_owned_by_another_user', () => evaluateLyricFormattingPersistence({ operation, currentSong: { id: SONG_ID, letraRaw: RAW, lyricFormatting: null }, actorUid: UID, existingRequest: { actorUid: 'other', operationFingerprint: operation.operationFingerprint } }));
await expectCode('request_id_conflict', () => evaluateLyricFormattingPersistence({ operation, currentSong: { id: SONG_ID, letraRaw: RAW, lyricFormatting: null }, actorUid: UID, existingRequest: { actorUid: UID, operationFingerprint: 'different' } }));
await expectCode('formatting_conflict', () => evaluateLyricFormattingPersistence({ operation, currentSong: { id: SONG_ID, letraRaw: RAW, lyricFormatting: VALID }, actorUid: UID }));
assert.equal(stableSerializeFormatting({ b: 2, a: 1 }), stableSerializeFormatting({ a: 1, b: 2 }));
assert.match(await computeLyricsHash(RAW), /^[a-f0-9]{64}$/);
assert.match(await computeFormattingHash(VALID, { lyricsRaw: RAW }), /^[a-f0-9]{64}$/);
assert.equal(JSON.stringify(operation).includes('updatedAt'), false);

// Callable payload preflight uses the exact backend wire-data contract.
const callableBase = {
  songId: SONG_ID,
  lyricFormatting: null,
  expectedLyricsHash: 'a'.repeat(64),
  expectedFormattingHash: 'b'.repeat(64),
  requestId: REQUEST_ID,
  letraRaw: '',
};
const exactLyrics = 'x'.repeat(LYRIC_FORMATTING_PERSISTENCE_LIMITS.maxOperationBytes - measureV21SavePayloadBytes(callableBase));
const exactPayload = { ...callableBase, letraRaw: exactLyrics };
assert.equal(measureV21SavePayloadBytes(exactPayload), LYRIC_FORMATTING_PERSISTENCE_LIMITS.maxOperationBytes);
assert.equal(validateV21SavePayloadSize(exactPayload).letraRaw.length, exactLyrics.length);
assert.throws(
  () => validateV21SavePayloadSize({ ...exactPayload, letraRaw: `${exactLyrics}x` }),
  error => error instanceof LyricFormattingPersistenceError && error.code === 'payload-too-large'
);
const unicodePayload = { ...callableBase, letraRaw: 'Cafe\u0301\r\n\u{1F64C}\u{1F3FD} "\n"' };
const normalizedUnicode = validateV21SavePayloadSize(unicodePayload);
assert.equal(normalizedUnicode.letraRaw, 'Caf\u00e9\n\u{1F64C}\u{1F3FD} "\n"');
assert.ok(measureV21SavePayloadBytes(normalizedUnicode) > normalizedUnicode.letraRaw.length);
const { letraRaw: _omittedLyrics, ...formatOnlyPayload } = callableBase;
assert.equal(Object.hasOwn(validateV21SavePayloadSize(formatOnlyPayload), 'letraRaw'), false);

console.log('Projection V2.1-C3A persistence contract: 44 scenarios PASS');
