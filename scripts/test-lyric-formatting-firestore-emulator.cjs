const assert = require('node:assert/strict');
const admin = require('../functions/node_modules/firebase-admin');
const backend = require('../functions/lyricFormattingPersistence');
const { createLyricFormattingService } = require('../functions/lyricFormattingService');
const { createFirestoreLyricFormattingRepository } = require('../functions/firestoreLyricFormattingRepository');
const { assertLegacySongContentWriteCompatible } = require('../functions/legacySongFormattingGuard');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { doc, setDoc, updateDoc } = require('firebase/firestore');

if (process.env.GCLOUD_PROJECT !== 'demo-kadosh-e2e' || process.env.GOOGLE_CLOUD_PROJECT !== 'demo-kadosh-e2e') throw new Error('demo_project_required');
if (!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '')) throw new Error('local_firestore_emulator_required');
if (process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.FIREBASE_TOKEN || process.env.CLOUDSDK_AUTH_ACCESS_TOKEN) throw new Error('real_credentials_forbidden');

const app = admin.initializeApp({ projectId: 'demo-kadosh-e2e' }, `lyrics-${Date.now()}`);
const db = admin.firestore(app);
const repository = createFirestoreLyricFormattingRepository(db);
const service = createLyricFormattingService({ repository, now: () => 1700000000000 });
const lyrics = '# Coro 1\nSanto, santo\n\nSanto, santo';
const sidecar = {
  version: 1,
  sourceLyricsHash: backend.hashLyricsSource(lyrics),
  identities: { sections: [{ id: 'section-1', fingerprint: 'same', titleFingerprint: 'coro', previousFingerprint: null, nextFingerprint: null, slides: [
    { id: 'slide-a', fingerprint: 'same', previousFingerprint: null, nextFingerprint: 'same' },
    { id: 'slide-b', fingerprint: 'same', previousFingerprint: 'same', nextFingerprint: null },
  ] }] },
  blocks: [
    { id: 'block-a', scope: { type: 'slide', sectionId: 'section-1', slideId: 'slide-a' }, sourceHash: backend.hashLyricsSource('Santo, santo'), reconciliation: 'resolved', segments: [{ id: 'seg-a', anchor: { quote: 'Santo' }, style: { color: 'primary' }, reconciliation: 'resolved' }] },
    { id: 'block-b', scope: { type: 'slide', sectionId: 'section-1', slideId: 'slide-b' }, sourceHash: backend.hashLyricsSource('Santo, santo'), reconciliation: 'resolved', segments: [{ id: 'seg-b', anchor: { quote: 'santo' }, style: { color: 'accent' }, reconciliation: 'resolved' }] },
  ],
};
const expectCode = async (code, callback) => assert.rejects(callback, error => error?.code === code);
const dataFor = (song, requestId, extra = {}) => ({ songId: song.id, lyricFormatting: sidecar, expectedLyricsHash: backend.computeLyricsHash(song.letraRaw), expectedFormattingHash: backend.computeFormattingHash(song.lyricFormatting ?? null, song.letraRaw), requestId, ...extra });

(async () => {
  try {
    await db.collection('sistema').doc('permissionRoles').set({ roleDefaults: { multimedia: { 'songs.editLyrics': true }, musico: { 'songs.editLyrics': false } } });
    await db.collection('usuarios').doc('allowed').set({ rol: 'multimedia', accountStatus: 'active' });
    await db.collection('usuarios').doc('allowed-two').set({ rol: 'multimedia', accountStatus: 'active' });
    await db.collection('usuarios').doc('denied').set({ rol: 'musico', accountStatus: 'active' });
    await db.collection('usuarios').doc('suspended').set({ rol: 'multimedia', accountStatus: 'suspended' });
    const song = { id: 'song-emulator', letraRaw: lyrics, lyricFormatting: null, titulo: 'Preserve', recursos: [{ id: 'keep' }] };
    await db.collection('canciones').doc(song.id).set({ ...song });

    const request = dataFor(song, 'lyrics_emulator_request_0001');
    const first = await service.save({ auth: { uid: 'allowed' }, data: request });
    assert.equal(first.idempotent, false);
    let stored = (await db.collection('canciones').doc(song.id).get()).data();
    assert.equal(stored.titulo, 'Preserve');
    assert.deepEqual(stored.recursos, [{ id: 'keep' }]);
    assert.equal(stored.letraRaw, lyrics);
    assert.equal(stored.lyricFormatting.blocks[0].scope.slideId, 'slide-a');
    assert.equal(stored.lyricFormatting.blocks[1].scope.slideId, 'slide-b');

    const restartedService = createLyricFormattingService({ repository: createFirestoreLyricFormattingRepository(db), now: () => 1800000000000 });
    const retry = await restartedService.save({ auth: { uid: 'allowed' }, data: request });
    assert.equal(retry.idempotent, true);
    assert.equal((await db.collection('canciones').doc(song.id).collection('permissionAudit').get()).size, 1);
    await expectCode('idempotency-conflict', () => service.save({ auth: { uid: 'allowed-two' }, data: request }));
    await expectCode('idempotency-conflict', () => service.save({ auth: { uid: 'allowed' }, data: { ...request, lyricFormatting: null } }));
    await expectCode('permission-denied', () => service.save({ auth: { uid: 'denied' }, data: { ...request, requestId: 'lyrics_emulator_request_0002' } }));
    await expectCode('permission-denied', () => service.save({ auth: { uid: 'suspended' }, data: { ...request, requestId: 'lyrics_emulator_request_0003' } }));
    await expectCode('unauthenticated', () => service.save({ auth: null, data: request }));
    await expectCode('song-not-found', () => service.save({ auth: { uid: 'allowed' }, data: { ...request, songId: 'missing', requestId: 'lyrics_emulator_request_0004' } }));

    const staleRequest = { ...request, requestId: 'lyrics_emulator_request_0005' };
    await db.collection('canciones').doc(song.id).update({ letraRaw: `${lyrics}\nchanged`, lyricFormatting: null });
    await expectCode('stale-lyrics', () => service.save({ auth: { uid: 'allowed' }, data: staleRequest }));
    stored = (await db.collection('canciones').doc(song.id).get()).data();
    assert.equal(stored.lyricFormatting, null);

    await db.collection('canciones').doc(song.id).set({ ...song });
    const concurrentBase = dataFor(song, 'lyrics_emulator_request_0006');
    const alternate = structuredClone(sidecar); alternate.blocks[0].segments[0].style.color = 'secondary';
    const outcomes = await Promise.allSettled([
      service.save({ auth: { uid: 'allowed' }, data: concurrentBase }),
      service.save({ auth: { uid: 'allowed' }, data: { ...concurrentBase, requestId: 'lyrics_emulator_request_0007', lyricFormatting: alternate } }),
    ]);
    assert.equal(outcomes.filter(item => item.status === 'fulfilled').length, 1);
    assert.equal(outcomes.filter(item => item.status === 'rejected' && item.reason.code === 'formatting-conflict').length, 1);

    await db.collection('canciones').doc(song.id).set({ ...song });
    const nextLyrics = `${lyrics}\nPuente`;
    const nextSidecar = { ...sidecar, sourceLyricsHash: backend.hashLyricsSource(nextLyrics) };
    const atomicRequest = dataFor(song, 'lyrics_emulator_request_0008', { letraRaw: nextLyrics, lyricFormatting: nextSidecar });
    const atomic = await service.save({ auth: { uid: 'allowed' }, data: atomicRequest });
    assert.equal(atomic.kind, 'lyrics-and-format');
    stored = (await db.collection('canciones').doc(song.id).get()).data();
    assert.equal(stored.letraRaw, nextLyrics);
    assert.equal(stored.lyricFormatting.sourceLyricsHash, backend.hashLyricsSource(nextLyrics));

    await db.collection('usuarios').doc('allowed').update({ permissionOverrides: { 'songs.editLyrics': false } });
    await expectCode('permission-denied', () => service.save({ auth: { uid: 'allowed' }, data: { ...atomicRequest, requestId: 'lyrics_emulator_request_0009' } }));

    await db.collection('usuarios').doc('rules-owner').set({ rol: 'dueno', accountStatus: 'active' });
    await db.collection('usuarios').doc('rules-editor').set({ rol: 'multimedia', accountStatus: 'active' });
    await db.collection('canciones').doc('rules-song').set({ letraRaw: lyrics, lyricFormatting: null });
    const testEnvironment = await initializeTestEnvironment({ projectId: 'demo-kadosh-e2e', firestore: { host: '127.0.0.1', port: Number(process.env.FIRESTORE_EMULATOR_HOST.split(':')[1]) } });
    try {
      const ownerDb = testEnvironment.authenticatedContext('rules-owner').firestore();
      const editorDb = testEnvironment.authenticatedContext('rules-editor').firestore();
      await assertFails(updateDoc(doc(editorDb, 'canciones', 'rules-song'), { lyricFormatting: sidecar }));
      await assertFails(updateDoc(doc(editorDb, 'canciones', 'rules-song'), { letraRaw: `${lyrics}\nLimited role` }));
      await assertFails(setDoc(doc(editorDb, 'lyricFormattingOperations', 'forged'), { actorUid: 'rules-editor' }));
      await assertFails(setDoc(doc(ownerDb, 'canciones', 'rules-song', 'permissionAudit', 'forged'), { actorUid: 'rules-owner' }));
      await assertFails(updateDoc(doc(ownerDb, 'canciones', 'rules-song'), { letraRaw: `${lyrics}\nDirect` }));
      await assertFails(updateDoc(doc(ownerDb, 'canciones', 'rules-song'), { lyricFormatting: sidecar }));
      await assertFails(updateDoc(doc(ownerDb, 'canciones', 'rules-song'), { letraRaw: `${lyrics}\nDirect`, lyricFormatting: sidecar }));
      await db.collection('canciones').doc('rules-formatted').set({ letraRaw: lyrics, lyricFormatting: sidecar, titulo: 'Formatted' });
      await assertFails(updateDoc(doc(ownerDb, 'canciones', 'rules-formatted'), { lyricFormatting: null }));
      await assertSucceeds(updateDoc(doc(ownerDb, 'canciones', 'rules-song'), { titulo: 'Metadata allowed' }));
      await assertSucceeds(setDoc(doc(ownerDb, 'canciones', 'rules-created'), { titulo: 'Created', letraRaw: lyrics }));
      await assertSucceeds(setDoc(doc(ownerDb, 'canciones', 'rules-created-null'), { titulo: 'Created null', letraRaw: lyrics, lyricFormatting: null }));
      await assertFails(setDoc(doc(ownerDb, 'canciones', 'rules-created-formatted'), { titulo: 'Blocked', letraRaw: lyrics, lyricFormatting: sidecar }));
    } finally {
      await testEnvironment.cleanup();
    }

    const raceRef = db.collection('canciones').doc('legacy-race');
    await raceRef.set({ letraRaw: lyrics, lyricFormatting: null, titulo: 'Race', recursos: [{ id: 'keep' }] });
    let releaseFormattingWrite;
    let notifyFormattingRead;
    const formattingRead = new Promise(resolve => { notifyFormattingRead = resolve; });
    const release = new Promise(resolve => { releaseFormattingWrite = resolve; });
    const formattingWrite = db.runTransaction(async transaction => {
      const snapshot = await transaction.get(raceRef);
      assert.equal(snapshot.get('lyricFormatting'), null);
      notifyFormattingRead();
      await release;
      transaction.update(raceRef, { lyricFormatting: sidecar });
    });
    await formattingRead;
    const legacyWrite = db.runTransaction(async transaction => {
      const snapshot = await transaction.get(raceRef);
      assertLegacySongContentWriteCompatible(snapshot.data(), `${lyrics}\nLegacy change`);
      transaction.update(raceRef, { letraRaw: `${lyrics}\nLegacy change` });
    });
    releaseFormattingWrite();
    await formattingWrite;
    await assert.rejects(legacyWrite, error => error?.code === 'projection-v2-compatible-save-required');
    const raceStored = (await raceRef.get()).data();
    assert.equal(raceStored.letraRaw, lyrics);
    assert.deepEqual(raceStored.lyricFormatting, sidecar);
    assert.deepEqual(raceStored.recursos, [{ id: 'keep' }]);

    console.log('Projection V2.1-C3B/B.1 Firestore Emulator: 33 scenarios PASS');
  } finally {
    await app.delete();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
