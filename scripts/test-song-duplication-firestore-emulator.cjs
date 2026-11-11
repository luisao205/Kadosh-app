const assert = require('node:assert/strict');
const admin = require('../functions/node_modules/firebase-admin');
const { initializeTestEnvironment, assertFails } = require('@firebase/rules-unit-testing');
const { doc, setDoc } = require('firebase/firestore');
const formatting = require('../functions/lyricFormattingPersistence');
const { createSongDuplicationService } = require('../functions/songDuplicationService');
const { createFirestoreSongDuplicationRepository } = require('../functions/firestoreSongDuplicationRepository');

if (process.env.GCLOUD_PROJECT !== 'demo-kadosh-e2e' || process.env.GOOGLE_CLOUD_PROJECT !== 'demo-kadosh-e2e') throw new Error('demo_project_required');
if (!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '')) throw new Error('local_firestore_emulator_required');
if (process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.FIREBASE_TOKEN || process.env.CLOUDSDK_AUTH_ACCESS_TOKEN) throw new Error('real_credentials_forbidden');

const app = admin.initializeApp({ projectId: 'demo-kadosh-e2e' }, `dup-${Date.now()}`);
const db = admin.firestore(app);
const service = createSongDuplicationService({ repository: createFirestoreSongDuplicationRepository(db), now: () => 1700000000000 });
const lyrics = '# Coro\n[C] Santo\n\n[C] Santo';
const sidecar = {
  version: 1,
  sourceLyricsHash: formatting.hashLyricsSource(lyrics),
  identities: { sections: [{ id: 'section-1', fingerprint: 'same', titleFingerprint: 'coro', previousFingerprint: null, nextFingerprint: null, slides: [
    { id: 'slide-a', fingerprint: 'same', previousFingerprint: null, nextFingerprint: 'same' },
    { id: 'slide-b', fingerprint: 'same', previousFingerprint: 'same', nextFingerprint: null },
  ] }] },
  blocks: [
    { id: 'block-a', scope: { type: 'slide', sectionId: 'section-1', slideId: 'slide-a' }, sourceHash: formatting.hashLyricsSource('[C] Santo'), reconciliation: 'resolved', segments: [{ id: 'segment-a', anchor: { quote: 'Santo' }, style: { color: 'primary' }, reconciliation: 'resolved' }] },
    { id: 'block-b', scope: { type: 'slide', sectionId: 'section-1', slideId: 'slide-b' }, sourceHash: formatting.hashLyricsSource('[C] Santo'), reconciliation: 'resolved', segments: [{ id: 'segment-b', anchor: { quote: 'Santo' }, style: { color: 'accent' }, reconciliation: 'resolved' }] },
  ],
};
const expectCode = (code, fn) => assert.rejects(fn, error => error?.code === code);
const invoke = (uid, songId, requestId) => service.duplicate({ auth: { uid }, data: { songId, requestId } });

(async () => {
  let environment;
  try {
    await db.collection('sistema').doc('permissionRoles').set({ roleDefaults: { multimedia: { 'songs.create': true }, musico: { 'songs.create': false } } });
    await db.collection('usuarios').doc('allowed').set({ rol: 'multimedia', accountStatus: 'active' });
    await db.collection('usuarios').doc('allowed-two').set({ rol: 'multimedia', accountStatus: 'active' });
    await db.collection('usuarios').doc('denied').set({ rol: 'musico', accountStatus: 'active' });
    await db.collection('usuarios').doc('suspended').set({ rol: 'multimedia', accountStatus: 'suspended' });
    await db.collection('mediaLibrary').doc('media-1').set({ title: 'Fixture', usedBy: [], firstUsedAt: null });
    const source = { titulo: 'Formatted', letraRaw: lyrics, lyricFormatting: sidecar, sectionMedia: { Coro: [{ id: 'old', mediaId: 'media-1', title: 'Fixture', type: 'video', url: '/fixture.webm' }] }, createdBy: 'old', internalState: 'drop' };
    await db.collection('canciones').doc('source').set(source);

    const first = await invoke('allowed', 'source', 'duplicate_emulator_0001');
    const copySnap = await db.collection('canciones').doc(first.songId).get();
    assert.equal(copySnap.exists, true);
    assert.equal(copySnap.get('titulo'), 'Formatted (Copia)');
    assert.equal(copySnap.get('createdBy'), undefined);
    assert.equal(copySnap.get('internalState'), undefined);
    assert.equal(copySnap.get('lyricFormatting').blocks[0].scope.slideId, 'slide-a');
    assert.equal(copySnap.get('lyricFormatting').blocks[1].scope.slideId, 'slide-b');
    assert.equal((await db.collection('mediaLibrary').doc('media-1').get()).get('usedBy')[0].songId, first.songId);
    assert.equal((await db.collection('canciones').doc('source').get()).get('titulo'), 'Formatted');

    const retry = await createSongDuplicationService({ repository: createFirestoreSongDuplicationRepository(db) }).duplicate({ auth: { uid: 'allowed' }, data: { songId: 'source', requestId: 'duplicate_emulator_0001' } });
    assert.equal(retry.idempotent, true);
    assert.equal(retry.songId, first.songId);
    assert.equal((await db.collection('canciones').doc(first.songId).collection('permissionAudit').get()).size, 1);
    await expectCode('idempotency-conflict', () => invoke('allowed-two', 'source', 'duplicate_emulator_0001'));
    await expectCode('permission-denied', () => invoke('denied', 'source', 'duplicate_emulator_0002'));
    await expectCode('permission-denied', () => invoke('suspended', 'source', 'duplicate_emulator_0003'));
    await expectCode('song-not-found', () => invoke('allowed', 'missing', 'duplicate_emulator_0004'));

    await db.collection('canciones').doc('legacy').set({ titulo: 'Legacy', letraRaw: '# V\nLegacy' });
    const legacy = await invoke('allowed', 'legacy', 'duplicate_emulator_0005');
    assert.equal((await db.collection('canciones').doc(legacy.songId).get()).get('lyricFormatting'), undefined);
    await db.collection('canciones').doc('null').set({ titulo: 'Null', letraRaw: '# V\nNull', lyricFormatting: null });
    const nullCopy = await invoke('allowed', 'null', 'duplicate_emulator_0006');
    assert.equal((await db.collection('canciones').doc(nullCopy.songId).get()).get('lyricFormatting'), null);

    const concurrent = await Promise.all([
      invoke('allowed', 'source', 'duplicate_emulator_0007'),
      invoke('allowed', 'source', 'duplicate_emulator_0007'),
    ]);
    assert.equal(concurrent[0].songId, concurrent[1].songId);
    assert.equal(concurrent.filter(item => item.idempotent === false).length, 1);
    assert.equal(concurrent.filter(item => item.idempotent === true).length, 1);

    const raceRef = db.collection('canciones').doc('race');
    await raceRef.set({ titulo: 'Before', letraRaw: '# V\nBefore', lyricFormatting: null });
    let releaseEdit;
    let editing;
    const locked = new Promise(resolve => { editing = resolve; });
    const release = new Promise(resolve => { releaseEdit = resolve; });
    const edit = db.runTransaction(async transaction => {
      const snap = await transaction.get(raceRef);
      assert.equal(snap.get('titulo'), 'Before');
      editing();
      await release;
      transaction.update(raceRef, { titulo: 'After', letraRaw: '# V\nAfter' });
    });
    await locked;
    const duplication = invoke('allowed', 'race', 'duplicate_emulator_0008');
    releaseEdit();
    await edit;
    const raced = await duplication;
    const racedCopy = (await db.collection('canciones').doc(raced.songId).get()).data();
    assert.equal(racedCopy.titulo, 'After (Copia)');
    assert.equal(racedCopy.letraRaw, '# V\nAfter');

    environment = await initializeTestEnvironment({ projectId: 'demo-kadosh-e2e', firestore: { host: '127.0.0.1', port: Number(process.env.FIRESTORE_EMULATOR_HOST.split(':')[1]) } });
    const client = environment.authenticatedContext('allowed').firestore();
    await assertFails(setDoc(doc(client, 'canciones', 'forged-formatted-copy'), { titulo: 'Forged', letraRaw: lyrics, lyricFormatting: sidecar }));
    await assertFails(setDoc(doc(client, 'songDuplicationOperations', 'forged'), { actorUid: 'allowed' }));

    console.log('Projection V2.1-C3B.2 Firestore Emulator: 30 scenarios PASS');
  } finally {
    if (environment) await environment.cleanup();
    await app.delete();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
