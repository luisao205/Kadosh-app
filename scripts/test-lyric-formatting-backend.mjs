import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  canonicalizeLyricsForPersistence,
  computeFormattingHash as browserFormattingHash,
  computeLyricsHash as browserLyricsHash,
  measureV21SavePayloadBytes as browserPayloadBytes,
  validateV21SavePayloadSize as browserValidatePayload,
} from '../src/utils/lyricFormattingPersistence.js';

const require = createRequire(import.meta.url);
const backend = require('../functions/lyricFormattingPersistence.js');
const { createLyricFormattingService } = require('../functions/lyricFormattingService.js');

const lyrics = '# Coro 1\r\nSanto, santo\r\n\r\nSanto, santo';
const sidecar = {
  version: 1,
  sourceLyricsHash: backend.hashLyricsSource(lyrics),
  identities: {
    sections: [{
      id: 'section-coro-1', fingerprint: 'same', titleFingerprint: 'coro-1', previousFingerprint: null, nextFingerprint: null,
      slides: [
        { id: 'slide-coro-a', fingerprint: 'same', previousFingerprint: null, nextFingerprint: 'same' },
        { id: 'slide-coro-b', fingerprint: 'same', previousFingerprint: 'same', nextFingerprint: null },
      ],
    }],
  },
  blocks: [
    { id: 'block-a', scope: { type: 'slide', sectionId: 'section-coro-1', slideId: 'slide-coro-a' }, sourceHash: backend.hashLyricsSource('Santo, santo'), reconciliation: 'resolved', segments: [{ id: 'segment-a', anchor: { quote: 'Santo' }, style: { color: 'primary' }, reconciliation: 'resolved' }] },
    { id: 'block-b', scope: { type: 'slide', sectionId: 'section-coro-1', slideId: 'slide-coro-b' }, sourceHash: backend.hashLyricsSource('Santo, santo'), reconciliation: 'resolved', segments: [{ id: 'segment-b', anchor: { quote: 'santo' }, style: { color: 'accent' }, reconciliation: 'resolved' }] },
  ],
};
const requestId = suffix => `lyrics_request_${suffix.padStart(4, '0')}`;
const expectCode = async (code, callback) => assert.rejects(callback, error => error?.code === code);

assert.equal(backend.canonicalizeLyrics(lyrics), canonicalizeLyricsForPersistence(lyrics));
assert.equal(backend.computeLyricsHash(lyrics), await browserLyricsHash(lyrics));
assert.equal(backend.computeFormattingHash(sidecar, lyrics), await browserFormattingHash(sidecar, { lyricsRaw: lyrics }));
assert.equal(backend.computeLyricsHash('cafe\u0301'), backend.computeLyricsHash('caf\u00e9'));
assert.notEqual(backend.computeLyricsHash('a\n\nb'), backend.computeLyricsHash('a\nb'));
assert.notEqual(backend.computeFormattingHash(sidecar, lyrics), backend.computeFormattingHash({ ...sidecar, blocks: [...sidecar.blocks].reverse() }, lyrics));
assert.equal(backend.validateSidecar(sidecar, lyrics).blocks[0].scope.slideId, 'slide-coro-a');
assert.notEqual(sidecar.blocks[0].scope.slideId, sidecar.blocks[1].scope.slideId);

const duplicate = structuredClone(sidecar);
duplicate.identities.sections[0].slides[1].id = 'slide-coro-a';
assert.throws(() => backend.validateSidecar(duplicate, lyrics), error => error.code === 'invalid-format');
const ambiguous = structuredClone(sidecar);
ambiguous.blocks[0].reconciliation = 'ambiguous';
assert.throws(() => backend.validateSidecar(ambiguous, lyrics), error => error.code === 'reconciliation-required');
const stale = structuredClone(sidecar);
stale.sourceLyricsHash = backend.hashLyricsSource('old');
assert.throws(() => backend.validateSidecar(stale, lyrics), error => error.code === 'stale-lyrics');
const unknown = structuredClone(sidecar);
unknown.extra = true;
assert.throws(() => backend.validateSidecar(unknown, lyrics), error => error.code === 'invalid-format');
assert.throws(() => backend.validateRequest({}), error => error.code === 'invalid-format');

const wireBase = {
  songId: 'song-a', lyricFormatting: null,
  expectedLyricsHash: 'a'.repeat(64), expectedFormattingHash: 'b'.repeat(64),
  requestId: requestId('size'), letraRaw: '',
};
const exactWireLyrics = 'x'.repeat(backend.LIMITS.maxOperationBytes - backend.measureSavePayloadBytes(wireBase));
const exactWirePayload = { ...wireBase, letraRaw: exactWireLyrics };
assert.equal(browserPayloadBytes(exactWirePayload), backend.measureSavePayloadBytes(exactWirePayload));
assert.deepEqual(browserValidatePayload(exactWirePayload), backend.validateRequest(exactWirePayload).data);
const overWirePayload = { ...exactWirePayload, letraRaw: `${exactWireLyrics}x` };
assert.throws(() => browserValidatePayload(overWirePayload), error => error.code === 'payload-too-large');
assert.throws(() => backend.validateRequest(overWirePayload), error => error.code === 'payload-too-large');
const multibyteWire = { ...wireBase, letraRaw: '\u00e1\u{1F64C}\r\n\\"' };
assert.equal(browserPayloadBytes(browserValidatePayload(multibyteWire)), backend.measureSavePayloadBytes(backend.validateRequest(multibyteWire).data));

const makeLargeSidecar = segmentsPerBlock => ({
  ...sidecar,
  blocks: Array.from({ length: 64 }, (_, blockIndex) => ({
    id: `block-${blockIndex}`,
    scope: { type: 'slide', sectionId: 'section-coro-1', slideId: 'slide-coro-a' },
    sourceHash: backend.hashLyricsSource('Santo, santo'),
    reconciliation: 'resolved',
    segments: Array.from({ length: segmentsPerBlock }, (_, segmentIndex) => ({
      id: `segment-${blockIndex}-${segmentIndex}`,
      anchor: { quote: 'Santo', prefix: 'p'.repeat(160), suffix: 's'.repeat(160) },
      style: { bold: true, color: 'primary', scale: 'lg', spacing: 'relaxed', transform: 'uppercase' },
      reconciliation: 'resolved',
    })),
  })),
});
const operationLargeSidecar = makeLargeSidecar(4);
assert.ok(backend.measureSavePayloadBytes({ ...wireBase, lyricFormatting: operationLargeSidecar }) > backend.LIMITS.maxOperationBytes);
assert.doesNotThrow(() => backend.validateSidecar(operationLargeSidecar, lyrics));
assert.throws(() => backend.validateRequest({ ...wireBase, lyricFormatting: operationLargeSidecar }), error => error.code === 'payload-too-large');
const structurallyOversizedSidecar = makeLargeSidecar(16);
assert.ok(Buffer.byteLength(backend.stableSerialize(structurallyOversizedSidecar), 'utf8') > backend.LIMITS.maxSidecarBytes);
assert.throws(() => backend.validateSidecar(structurallyOversizedSidecar, lyrics), error => error.code === 'payload-too-large');

class MockRepository {
  constructor({ actor = { accountStatus: 'active', permissions: ['songs.editLyrics'] }, song = { id: 'song-a', letraRaw: lyrics, lyricFormatting: null, title: 'Keep' } } = {}) {
    this.actor = actor;
    this.song = structuredClone(song);
    this.operations = new Map();
    this.audits = [];
  }
  async runTransaction(callback) {
    const staged = { song: structuredClone(this.song), operations: new Map(this.operations), audits: structuredClone(this.audits) };
    const result = await callback({
      getActorAuthorization: async () => this.actor,
      getOperation: async (_uid, songId, id) => staged.operations.get(`${songId}:${id}`) || null,
      getSong: async id => id === staged.song.id ? structuredClone(staged.song) : null,
      updateSong: async (id, patch) => { assert.equal(id, staged.song.id); Object.assign(staged.song, structuredClone(patch)); },
      createOperation: async (_uid, songId, id, value) => staged.operations.set(`${songId}:${id}`, structuredClone(value)),
      appendAudit: async (_songId, value) => staged.audits.push(structuredClone(value)),
    });
    this.song = staged.song; this.operations = staged.operations; this.audits = staged.audits;
    return result;
  }
}

const baseData = async (repo, id, extra = {}) => ({
  songId: repo.song.id,
  lyricFormatting: sidecar,
  expectedLyricsHash: backend.computeLyricsHash(repo.song.letraRaw),
  expectedFormattingHash: backend.computeFormattingHash(repo.song.lyricFormatting ?? null, repo.song.letraRaw),
  requestId: requestId(id),
  ...extra,
});

const repository = new MockRepository();
const service = createLyricFormattingService({ repository, now: () => 1700000000000 });
await expectCode('unauthenticated', () => service.save({ auth: null, data: {} }));
const first = await service.save({ auth: { uid: 'actor-a' }, data: await baseData(repository, '1') });
assert.equal(first.idempotent, false);
assert.equal(repository.song.title, 'Keep');
assert.equal(repository.song.letraRaw, lyrics);
assert.deepEqual(repository.song.lyricFormatting, sidecar);
assert.equal(repository.audits.length, 1);
assert.equal(Object.hasOwn(repository.audits[0], 'letraRaw'), false);
const retry = await service.save({ auth: { uid: 'actor-a' }, data: await baseData({ song: { ...repository.song, lyricFormatting: null } }, '1') });
assert.equal(retry.idempotent, true);
assert.equal(repository.audits.length, 1);
const otherActorRetry = await baseData({ song: { ...repository.song, lyricFormatting: null } }, '1');
await expectCode('idempotency-conflict', () => service.save({ auth: { uid: 'actor-b' }, data: otherActorRetry }));

const conflictingRetry = { ...(await baseData(repository, '1')), lyricFormatting: null };
await expectCode('idempotency-conflict', () => service.save({ auth: { uid: 'actor-a' }, data: conflictingRetry }));
const deniedRepo = new MockRepository({ actor: { accountStatus: 'active', permissions: [] } });
const deniedData = await baseData(deniedRepo, '2');
await expectCode('permission-denied', () => createLyricFormattingService({ repository: deniedRepo }).save({ auth: { uid: 'denied' }, data: deniedData }));
const suspendedRepo = new MockRepository({ actor: { accountStatus: 'suspended', permissions: ['songs.editLyrics'] } });
const suspendedData = await baseData(suspendedRepo, '3');
await expectCode('permission-denied', () => createLyricFormattingService({ repository: suspendedRepo }).save({ auth: { uid: 'suspended' }, data: suspendedData }));

const atomicRepo = new MockRepository();
const atomicService = createLyricFormattingService({ repository: atomicRepo, now: () => 1700000000000 });
const nextLyrics = '# Coro 1\nSanto, santo\n\nSanto, santo';
const atomicSidecar = { ...sidecar, sourceLyricsHash: backend.hashLyricsSource(nextLyrics) };
const atomic = await atomicService.save({ auth: { uid: 'actor-a' }, data: await baseData(atomicRepo, '4', { letraRaw: nextLyrics, lyricFormatting: atomicSidecar }) });
assert.equal(atomic.kind, 'lyrics-and-format');
assert.equal(atomicRepo.song.letraRaw, nextLyrics);
assert.deepEqual(atomicRepo.song.lyricFormatting, atomicSidecar);

const staleRepo = new MockRepository();
const staleData = await baseData(staleRepo, '5');
staleRepo.song.letraRaw = `${staleRepo.song.letraRaw}\nchanged`;
await expectCode('stale-lyrics', () => createLyricFormattingService({ repository: staleRepo }).save({ auth: { uid: 'actor-a' }, data: staleData }));
assert.equal(staleRepo.song.lyricFormatting, null);

const conflictRepo = new MockRepository();
const conflictData = await baseData(conflictRepo, '6');
conflictRepo.song.lyricFormatting = sidecar;
await expectCode('formatting-conflict', () => createLyricFormattingService({ repository: conflictRepo }).save({ auth: { uid: 'actor-a' }, data: conflictData }));

const rollbackRepo = new MockRepository();
const bad = structuredClone(sidecar); bad.blocks[0].reconciliation = 'stale';
const rollbackData = { ...(await baseData(rollbackRepo, '7')), lyricFormatting: bad };
await expectCode('reconciliation-required', () => createLyricFormattingService({ repository: rollbackRepo }).save({ auth: { uid: 'actor-a' }, data: rollbackData }));
assert.equal(rollbackRepo.song.lyricFormatting, null);
assert.equal(rollbackRepo.operations.size, 0);

const nullRepo = new MockRepository({ song: { id: 'song-a', letraRaw: lyrics, title: 'Legacy' } });
const nullResult = await createLyricFormattingService({ repository: nullRepo }).save({ auth: { uid: 'actor-a' }, data: await baseData(nullRepo, '8', { lyricFormatting: null }) });
assert.equal(nullResult.ok, true);
assert.equal(nullRepo.song.title, 'Legacy');

let oversizedTransactionCalls = 0;
const oversizedRepository = { runTransaction: async () => { oversizedTransactionCalls += 1; } };
await expectCode('payload-too-large', () => createLyricFormattingService({ repository: oversizedRepository }).save({ auth: { uid: 'actor-a' }, data: overWirePayload }));
assert.equal(oversizedTransactionCalls, 0);

console.log('Projection V2.1-C3B backend unit contract: 37 scenarios PASS');
