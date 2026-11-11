const assert = require('node:assert/strict');
const admin = require('../functions/node_modules/firebase-admin');
const formatting = require('../functions/lyricFormattingPersistence');

const projectId = 'demo-kadosh-e2e';
const mode = process.env.KADOSH_V21_TEST_MODE;
if (process.env.GCLOUD_PROJECT !== projectId || process.env.GOOGLE_CLOUD_PROJECT !== projectId) throw new Error('demo_project_required');
if (!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '')) throw new Error('local_firestore_required');
if (!/^127\.0\.0\.1:\d+$/.test(process.env.FIREBASE_AUTH_EMULATOR_HOST || '')) throw new Error('local_auth_required');
if (process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.FIREBASE_TOKEN || process.env.CLOUDSDK_AUTH_ACCESS_TOKEN) throw new Error('real_credentials_forbidden');

const appName = `v21-callable-admin-${mode}-${Date.now()}`;
const adminApp = admin.initializeApp({ projectId }, appName);
const db = admin.firestore(adminApp);
const authAdmin = admin.auth(adminApp);
const lyrics = '# Coro\n[C] Santo\n\n[C] Santo';
const sidecarFor = value => ({
  version: 1,
  sourceLyricsHash: formatting.hashLyricsSource(value),
  identities: { sections: [{ id: 'section-1', fingerprint: 'same', titleFingerprint: 'coro', previousFingerprint: null, nextFingerprint: null, slides: [
    { id: 'slide-a', fingerprint: 'same', previousFingerprint: null, nextFingerprint: 'same' },
    { id: 'slide-b', fingerprint: 'same', previousFingerprint: 'same', nextFingerprint: null },
  ] }] },
  blocks: [
    { id: 'block-a', scope: { type: 'slide', sectionId: 'section-1', slideId: 'slide-a' }, sourceHash: formatting.hashLyricsSource('[C] Santo'), reconciliation: 'resolved', segments: [{ id: 'seg-a', anchor: { quote: 'Santo' }, style: { color: 'primary' }, reconciliation: 'resolved' }] },
    { id: 'block-b', scope: { type: 'slide', sectionId: 'section-1', slideId: 'slide-b' }, sourceHash: formatting.hashLyricsSource('[C] Santo'), reconciliation: 'resolved', segments: [{ id: 'seg-b', anchor: { quote: 'Santo' }, style: { color: 'accent' }, reconciliation: 'resolved' }] },
  ],
});
const sidecar = sidecarFor(lyrics);
const payload = (song, requestId, extra = {}) => ({
  songId: song.id,
  lyricFormatting: sidecar,
  expectedLyricsHash: formatting.computeLyricsHash(song.letraRaw),
  expectedFormattingHash: formatting.computeFormattingHash(song.lyricFormatting ?? null, song.letraRaw),
  requestId,
  ...extra,
});

const run = async () => {
  const firebase = await import('firebase/app');
  const authSdk = await import('firebase/auth');
  const functionsSdk = await import('firebase/functions');
  const firestoreSdk = await import('firebase/firestore');
  const clientApp = firebase.initializeApp({ apiKey: 'e2e-local', authDomain: `${projectId}.local`, projectId }, `v21-client-${mode}-${Date.now()}`);
  const auth = authSdk.getAuth(clientApp);
  authSdk.connectAuthEmulator(auth, 'http://127.0.0.1:9499', { disableWarnings: true });
  const functions = functionsSdk.getFunctions(clientApp);
  functionsSdk.connectFunctionsEmulator(functions, '127.0.0.1', 5601);
  const firestore = firestoreSdk.getFirestore(clientApp);
  firestoreSdk.connectFirestoreEmulator(firestore, '127.0.0.1', 8587);
  const call = name => functionsSdk.httpsCallable(functions, name);
  const expectError = async (code, detail, fn) => assert.rejects(fn, error => (
    error?.code === `functions/${code}` && (!detail || error?.details?.code === detail)
  ));

  if (mode === 'disabled') {
    await expectError('failed-precondition', 'feature-disabled', () => call('duplicateSongV21')({ songId: 'source', requestId: 'disabled_request_0001' }));
    assert.equal((await db.collection('canciones').get()).empty, true);
    console.log('Projection V2.1-C3C.1 callable disabled gate: PASS');
    await firebase.deleteApp(clientApp);
    return;
  }

  if (mode === 'restart') {
    await authSdk.signInWithEmailAndPassword(auth, 'allowed@e2e.local', 'Test123!');
    const retry = await call('duplicateSongV21')({ songId: 'formatted-source', requestId: 'callable_restart_0001' });
    assert.equal(retry.data.idempotent, true);
    assert.equal((await db.collection('songDuplicationOperations').get()).size >= 1, true);
    console.log('Projection V2.1-C3C.1 callable restart recovery: PASS');
    await authSdk.signOut(auth);
    await firebase.deleteApp(clientApp);
    return;
  }

  await db.collection('sistema').doc('permissionRoles').set({ roleDefaults: {
    multimedia: { 'songs.create': true, 'songs.editLyrics': true, 'songs.editChords': true, 'songs.editMetadata': true, 'events.edit': true },
    musico: { 'songs.create': false, 'songs.editLyrics': false, 'songs.editMetadata': false, 'events.edit': false },
  } });
  for (const user of [
    { uid: 'allowed', email: 'allowed@e2e.local', rol: 'multimedia', accountStatus: 'active' },
    { uid: 'denied', email: 'denied@e2e.local', rol: 'musico', accountStatus: 'active' },
    { uid: 'suspended', email: 'suspended@e2e.local', rol: 'multimedia', accountStatus: 'suspended' },
  ]) {
    await authAdmin.createUser({ uid: user.uid, email: user.email, password: 'Test123!' });
    await db.collection('usuarios').doc(user.uid).set({ rol: user.rol, accountStatus: user.accountStatus });
  }
  await db.collection('mediaLibrary').doc('media-1').set({ title: 'Fixture', usedBy: [] });
  const formatSong = { id: 'format-song', titulo: 'Format', letraRaw: lyrics, lyricFormatting: null };
  const atomicSong = { id: 'atomic-song', titulo: 'Atomic', letraRaw: lyrics, lyricFormatting: null };
  const formattedSource = { id: 'formatted-source', titulo: 'Formatted', artista: 'Kadosh', letraRaw: lyrics, lyricFormatting: sidecar, sectionMedia: { Coro: [{ id: 'old', mediaId: 'media-1', title: 'Fixture', type: 'video', url: '/fixture.webm' }] }, privateToken: 'drop' };
  await Promise.all([
    db.collection('canciones').doc(formatSong.id).set(formatSong),
    db.collection('canciones').doc(atomicSong.id).set(atomicSong),
    db.collection('canciones').doc(formattedSource.id).set(formattedSource),
    db.collection('canciones').doc('legacy-source').set({ titulo: 'Legacy', letraRaw: '# V\n[C]Legacy\n\nSegunda diapositiva' }),
    db.collection('eventos').doc('event-1').set({ titulo: 'Event', songProjectionStyleOverrides: {} }),
  ]);

  assert.deepEqual((await call('getV21Capability')({})).data, {
    enabled: false, canEditFormatting: false, canEditProjectionStyle: false, canDuplicate: false,
  });
  await expectError('unauthenticated', 'unauthenticated', () => call('saveLyricFormattingV21')(payload(formatSong, 'callable_format_unauth_01')));
  await authSdk.signInWithEmailAndPassword(auth, 'denied@e2e.local', 'Test123!');
  assert.deepEqual((await call('getV21Capability')({})).data, {
    enabled: false, canEditFormatting: false, canEditProjectionStyle: false, canDuplicate: false,
  });
  await expectError('permission-denied', 'permission-denied', () => call('duplicateSongV21')({ songId: 'legacy-source', requestId: 'callable_denied_0001' }));
  const deniedStyle = { preset: 'impact', motion: 'dynamic', alignment: 'center', backgroundTreatment: 'auto' };
  await expectError('permission-denied', null, () => call('updateSongMetadata')({ songId: 'legacy-source', changes: { projectionStyle: deniedStyle } }));
  await expectError('permission-denied', null, () => call('setEventSongProjectionStyle')({ eventId: 'event-1', songId: 'legacy-source', projectionStyle: deniedStyle }));
  await expectError('permission-denied', null, () => call('updateSongContent')({ songId: 'legacy-source', letraRaw: '# V\n[D]Cambio no autorizado\n\nSegunda diapositiva' }));
  assert.equal((await db.collection('canciones').doc('legacy-source').get()).get('projectionStyle'), undefined);
  assert.deepEqual((await db.collection('eventos').doc('event-1').get()).get('songProjectionStyleOverrides'), {});
  await authSdk.signOut(auth);
  await authSdk.signInWithEmailAndPassword(auth, 'suspended@e2e.local', 'Test123!');
  assert.deepEqual((await call('getV21Capability')({})).data, {
    enabled: false, canEditFormatting: false, canEditProjectionStyle: false, canDuplicate: false,
  });
  await expectError('permission-denied', 'permission-denied', () => call('saveLyricFormattingV21')(payload(formatSong, 'callable_suspended_01')));
  await authSdk.signOut(auth);
  await authSdk.signInWithEmailAndPassword(auth, 'allowed@e2e.local', 'Test123!');
  assert.deepEqual((await call('getV21Capability')({})).data, {
    enabled: true, canEditFormatting: true, canEditProjectionStyle: true, canDuplicate: true,
  });

  const combinedLegacyContent = '# V\n[D]Letra y acorde actualizados\n\nSegunda diapositiva preservada';
  const combinedLegacyResult = await call('updateSongContent')({ songId: 'legacy-source', letraRaw: combinedLegacyContent });
  assert.equal(combinedLegacyResult.data.operation, 'songs.editLyrics+songs.editChords');
  assert.equal((await db.collection('canciones').doc('legacy-source').get()).get('letraRaw'), combinedLegacyContent);

  await call('updateSongMetadata')({ songId: 'legacy-source', changes: { titulo: 'Legacy Updated' } });
  assert.equal((await db.collection('canciones').doc('legacy-source').get()).get('titulo'), 'Legacy Updated');
  const style = { preset: 'worship', motion: 'soft', alignment: 'center', backgroundTreatment: 'auto' };
  await call('updateSongMetadata')({ songId: 'legacy-source', changes: { projectionStyle: style } });
  await call('setEventSongProjectionStyle')({ eventId: 'event-1', songId: 'legacy-source', projectionStyle: style });
  assert.deepEqual((await db.collection('eventos').doc('event-1').get()).get('songProjectionStyleOverrides.legacy-source'), style);

  const beforeOversizedSong = (await db.collection('canciones').doc(atomicSong.id).get()).data();
  const beforeOversizedOperations = (await db.collection('lyricFormattingOperations').get()).size;
  const beforeOversizedAudits = (await db.collection('canciones').doc(atomicSong.id).collection('permissionAudit').get()).size;
  await expectError('invalid-argument', 'payload-too-large', () => call('saveLyricsAndFormattingV21')(
    payload(atomicSong, 'callable_oversized_0001', { letraRaw: `# Grande\n${'x'.repeat(70_000)}`, lyricFormatting: null })
  ));
  assert.deepEqual((await db.collection('canciones').doc(atomicSong.id).get()).data(), beforeOversizedSong);
  assert.equal((await db.collection('lyricFormattingOperations').get()).size, beforeOversizedOperations);
  assert.equal((await db.collection('canciones').doc(atomicSong.id).collection('permissionAudit').get()).size, beforeOversizedAudits);

  const formatted = await call('saveLyricFormattingV21')(payload(formatSong, 'callable_format_save_01'));
  assert.equal(formatted.data.kind, 'format-only');
  assert.equal((await db.collection('canciones').doc(formatSong.id).get()).get('lyricFormatting.blocks')[1].scope.slideId, 'slide-b');
  const nextLyrics = `${lyrics}\nPuente`;
  const nextSidecar = sidecarFor(nextLyrics);
  const atomic = await call('saveLyricsAndFormattingV21')(payload(atomicSong, 'callable_atomic_save_01', { letraRaw: nextLyrics, lyricFormatting: nextSidecar }));
  assert.equal(atomic.data.kind, 'lyrics-and-format');
  const atomicStored = (await db.collection('canciones').doc(atomicSong.id).get()).data();
  assert.equal(atomicStored.letraRaw, nextLyrics);
  assert.equal(atomicStored.lyricFormatting.sourceLyricsHash, formatting.hashLyricsSource(nextLyrics));

  await expectError('invalid-argument', 'invalid-format', () => call('saveLyricFormattingV21')(payload(formatSong, 'callable_extra_field_01', { extra: true })));
  await expectError('failed-precondition', 'stale-lyrics', () => call('saveLyricFormattingV21')({ ...payload(formatSong, 'callable_stale_hash_01'), expectedLyricsHash: 'a'.repeat(64) }));
  const unknown = structuredClone(sidecar); unknown.version = 999;
  const currentFormatSong = (await db.collection('canciones').doc(formatSong.id).get()).data();
  await expectError('failed-precondition', 'unsupported-version', () => call('saveLyricFormattingV21')(payload({ id: formatSong.id, ...currentFormatSong }, 'callable_unknown_ver_01', { lyricFormatting: unknown })));
  const ambiguous = structuredClone(sidecar); ambiguous.blocks[0].reconciliation = 'ambiguous';
  await expectError('failed-precondition', 'reconciliation-required', () => call('saveLyricFormattingV21')(payload({ id: formatSong.id, ...currentFormatSong }, 'callable_reconcile_0001', { lyricFormatting: ambiguous })));

  const legacyCopy = await call('duplicateSongV21')({ songId: 'legacy-source', requestId: 'callable_legacy_copy_01' });
  assert.equal((await db.collection('canciones').doc(legacyCopy.data.songId).get()).get('lyricFormatting'), undefined);
  const formattedCopy = await call('duplicateSongV21')({ songId: formattedSource.id, requestId: 'callable_restart_0001' });
  const copy = (await db.collection('canciones').doc(formattedCopy.data.songId).get()).data();
  assert.equal(copy.lyricFormatting.blocks[0].scope.slideId, 'slide-a');
  assert.equal(copy.lyricFormatting.blocks[1].scope.slideId, 'slide-b');
  assert.equal(copy.artista, 'Kadosh');
  assert.equal(copy.privateToken, undefined);
  assert.equal((await db.collection('mediaLibrary').doc('media-1').get()).get('usedBy')[0].songId, formattedCopy.data.songId);
  const retry = await call('duplicateSongV21')({ songId: formattedSource.id, requestId: 'callable_restart_0001' });
  assert.equal(retry.data.idempotent, true);
  const concurrent = await Promise.all([
    call('duplicateSongV21')({ songId: formattedSource.id, requestId: 'callable_concurrent_01' }),
    call('duplicateSongV21')({ songId: formattedSource.id, requestId: 'callable_concurrent_01' }),
  ]);
  assert.equal(concurrent[0].data.songId, concurrent[1].data.songId);
  await expectError('not-found', 'song-not-found', () => call('duplicateSongV21')({ songId: 'missing', requestId: 'callable_missing_song_1' }));

  const directDb = firestore;
  await assert.rejects(() => firestoreSdk.setDoc(firestoreSdk.doc(directDb, 'canciones', 'forged'), { titulo: 'Forged', letraRaw: lyrics, lyricFormatting: sidecar }), error => error?.code === 'permission-denied');
  const originalBefore = (await db.collection('canciones').doc(formattedSource.id).get()).data();
  assert.deepEqual(originalBefore.lyricFormatting, sidecar);
  console.log('Projection V2.1-C3F.5A callable E2E: 42 scenarios PASS');
  await authSdk.signOut(auth);
  await firebase.deleteApp(clientApp);
};

run().finally(() => adminApp.delete()).catch(error => { console.error(error); process.exitCode = 1; });
