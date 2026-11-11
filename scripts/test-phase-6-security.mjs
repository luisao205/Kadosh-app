import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { collection, deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { ROLE_PERMISSION_DEFAULTS } from '../src/utils/permissions.js';
import {
  assertSecurityEmulators,
  createSecurityActor,
  expectPermissionDenied,
} from '../e2e/helpers/securityClient.js';
import {
  createE2EEvent,
  createE2ESong,
  deleteE2EResource,
  e2eId,
  getSongAudit,
  readFirestoreDocument,
} from '../e2e/helpers/firestoreAdmin.js';

assertSecurityEmulators();

const require = createRequire(import.meta.url);
const admin = require('../functions/node_modules/firebase-admin');
const adminApp = admin.apps.find((app) => app.name === 'phase-6-security-admin')
  || admin.initializeApp({ projectId: 'kadosh-49600' }, 'phase-6-security-admin');
const adminDb = adminApp.firestore();

const USERS = Object.freeze({
  owner: { uid: 'e2e-owner', email: 'owner@e2e.local' },
  admin: { uid: 'e2e-admin', email: 'admin@e2e.local' },
  multimedia: { uid: 'e2e-multimedia', email: 'multimedia@e2e.local' },
  musico: { uid: 'e2e-musico', email: 'musico@e2e.local' },
  cantante: { uid: 'e2e-cantante', email: 'cantante@e2e.local' },
  pastor: { uid: 'e2e-pastor', email: 'pastor@e2e.local' },
  predicador: { uid: 'e2e-predicador', email: 'predicador@e2e.local' },
});

const matrix = [];
const record = async (id, expected, operation) => {
  await operation();
  matrix.push({ id, expected, result: 'PASS' });
};
const denied = (id, operation) => record(id, 'DENIED', () => expectPermissionDenied(operation, id));
const allowed = (id, operation) => record(id, 'ALLOWED', operation);

const actors = {};
for (const [role, fixture] of Object.entries(USERS)) actors[role] = await createSecurityActor(fixture.email);

const userRef = (uid) => adminDb.collection('usuarios').doc(uid);
const savedProfiles = new Map();
const preserveProfile = async (uid) => {
  if (savedProfiles.has(uid)) return;
  const snapshot = await userRef(uid).get();
  savedProfiles.set(uid, snapshot.data());
};
const restoreProfiles = async () => {
  await Promise.all([...savedProfiles.entries()].map(([uid, value]) => userRef(uid).set(value)));
};
const callablePayload = (eventId) => ({
  eventoId: eventId,
  presentationType: 'phrase',
  segments: [{ text: 'E2E-QA mensaje seguro', color: 'white', bold: false }],
  targets: { projector: true, singers: false, musicians: false },
});
const savedCanva = (eventId, title) => ({
  title,
  inputUrl: 'https://www.canva.com/design/DAFsecurity/view',
  sourceUrl: 'https://www.canva.com/design/DAFsecurity/view',
  embedUrl: 'https://www.canva.com/design/DAFsecurity/view?embed',
  pageCount: 2,
  defaultTargets: { projector: true, singers: false, musicians: false },
  setlistId: eventId,
  createdAt: 1,
  createdBy: USERS.owner.uid,
  updatedAt: 1,
  updatedBy: USERS.owner.uid,
});

const resources = [];
const remember = (collectionName, resource) => {
  resources.push({ collectionName, id: resource.id });
  return resource;
};

try {
  assert.deepEqual(
    (await adminDb.collection('sistema').doc('permissionRoles').get()).get('roleDefaults'),
    ROLE_PERMISSION_DEFAULTS,
    'Security fixtures must inherit canonical role defaults.'
  );

  // SEC-SONG-001 through SEC-SONG-007: functions are the protected content path.
  const song = remember('canciones', await createE2ESong({ titulo: e2eId('SEC-SONG') }));
  await allowed('SEC-SONG-001', async () => {
    const created = doc(actors.owner.firestore, 'canciones', e2eId('SEC-SONG-CREATE'));
    await setDoc(created, { titulo: e2eId('SEC-SONG-CREATE'), letraRaw: '[C]E2E', archived: false });
    await adminDb.collection('canciones').doc(created.id).delete();
  });
  await denied('SEC-SONG-001-DENY', () => setDoc(doc(actors.musico.firestore, 'canciones', e2eId('SEC-SONG-CREATE-DENY')), { titulo: e2eId('SEC-SONG-CREATE-DENY') }));
  await allowed('SEC-SONG-002', () => actors.owner.callable('updateSongLyrics', { songId: song.id, letraRaw: '[C]Letra segura' }));
  await allowed('SEC-SONG-003', () => actors.owner.callable('updateSongChords', { songId: song.id, letraRaw: '[G]Letra segura' }));
  await allowed('SEC-SONG-004', () => actors.owner.callable('updateSongMetadata', { songId: song.id, changes: { artista: 'Artista E2E-QA actualizado' } }));
  await allowed('SEC-SONG-005', async () => {
    await actors.owner.callable('setSongArchiveState', { songId: song.id, archived: true });
    assert.equal((await readFirestoreDocument('canciones', song.id)).archived, true);
    await actors.owner.callable('setSongArchiveState', { songId: song.id, archived: false });
  });
  const archivedDeleteSong = remember('canciones', await createE2ESong({
    titulo: e2eId('SEC-SONG-DELETE'),
    archived: true,
  }));
  await denied('SEC-SONG-DELETE-DIRECT-DENY', () => deleteDoc(doc(actors.owner.firestore, 'canciones', archivedDeleteSong.id)));
  await denied('SEC-SONG-DELETE-CALLABLE-DENY', () => actors.musico.callable('deleteArchivedSong', { songId: archivedDeleteSong.id }));
  await allowed('SEC-SONG-DELETE-CALLABLE-ALLOWED', async () => {
    await actors.owner.callable('deleteArchivedSong', { songId: archivedDeleteSong.id });
    assert.equal(await readFirestoreDocument('canciones', archivedDeleteSong.id), null);
  });
  await denied('SEC-SONG-004-DENY', () => actors.musico.callable('updateSongMetadata', { songId: song.id, changes: { artista: 'forged' } }));

  await preserveProfile(USERS.musico.uid);
  await userRef(USERS.musico.uid).update({ permissionOverrides: { 'songs.editLyrics': true } });
  await allowed('SEC-OVERRIDE-001-ALLOWED', () => actors.musico.callable('updateSongLyrics', { songId: song.id, letraRaw: '[G]Solo letra autorizada' }));
  await denied('SEC-SONG-003-ONLY-LYRICS-DENY', () => actors.musico.callable('updateSongChords', { songId: song.id, letraRaw: '[A]Solo letra autorizada' }));
  await denied('SEC-SONG-007-MISSING-CHORDS-DENY', () => actors.musico.callable('updateSongContent', { songId: song.id, letraRaw: '[A]Letra y acordes' }));
  await userRef(USERS.musico.uid).update({ permissionOverrides: { 'songs.editChords': true } });
  await allowed('SEC-OVERRIDE-001-CHORDS-ALLOWED', () => actors.musico.callable('updateSongChords', { songId: song.id, letraRaw: '[A]Solo letra autorizada' }));
  await denied('SEC-SONG-002-ONLY-CHORDS-DENY', () => actors.musico.callable('updateSongLyrics', { songId: song.id, letraRaw: '[A]Letra no autorizada' }));
  await denied('SEC-SONG-007-MISSING-LYRICS-DENY', () => actors.musico.callable('updateSongContent', { songId: song.id, letraRaw: '[C]Cambio combinado' }));
  await userRef(USERS.musico.uid).update({ permissionOverrides: { 'songs.editLyrics': true, 'songs.editChords': true } });
  await allowed('SEC-SONG-007-BOTH-ALLOWED', () => actors.musico.callable('updateSongContent', { songId: song.id, letraRaw: '[C]Cambio combinado autorizado' }));
  await allowed('SEC-SONG-007-OWNER-ALLOWED', () => actors.owner.callable('updateSongContent', { songId: song.id, letraRaw: '[D]Cambio combinado owner' }));
  assert.ok((await getSongAudit(song.id)).some((entry) => entry.action === 'songs.editContent' && entry.permissions?.length === 2));

  // SEC-EVENT and SEC-SETLIST direct Firestore paths are subject to Rules.
  const event = remember('eventos', await createE2EEvent());
  await adminDb.collection('eventos').doc(event.id).update({
    projectorState: { type: 'lyrics', contentType: 'lyrics', title: 'Estado anterior E2E-QA' },
    liveState: { activeContentType: 'lyrics', activeContentTitle: 'Estado anterior E2E-QA' },
  });
  await allowed('SEC-EVENT-002', () => updateDoc(doc(actors.owner.firestore, 'eventos', event.id), { lugar: 'Lugar E2E-QA seguro' }));
  await denied('SEC-EVENT-002-DENY', () => updateDoc(doc(actors.musico.firestore, 'eventos', event.id), { lugar: 'Bypass' }));
  await allowed('SEC-SETLIST-001', () => updateDoc(doc(actors.owner.firestore, 'eventos', event.id), { canciones: [song.id] }));
  await denied('SEC-SETLIST-001-DENY', () => updateDoc(doc(actors.musico.firestore, 'eventos', event.id), { canciones: [] }));
  const ownerCreatedEvent = doc(actors.owner.firestore, 'eventos', e2eId('SEC-EVENT-CREATE'));
  await allowed('SEC-EVENT-001', async () => {
    await setDoc(ownerCreatedEvent, { titulo: e2eId('SEC-EVENT-CREATE'), estado: 'programado' });
    await deleteDoc(ownerCreatedEvent);
  });
  await denied('SEC-EVENT-001-DENY', () => setDoc(doc(actors.musico.firestore, 'eventos', e2eId('SEC-EVENT-CREATE-DENY')), { titulo: e2eId('SEC-EVENT-CREATE-DENY') }));
  await denied('SEC-EVENT-003-DENY', () => deleteDoc(doc(actors.musico.firestore, 'eventos', event.id)));

  // SEC-TEAM: rules deny direct privilege mutation; the owner callable is the only management route.
  await denied('SEC-TEAM-001', () => updateDoc(doc(actors.admin.firestore, 'usuarios', USERS.musico.uid), { rol: 'admin' }));
  await denied('SEC-TEAM-002', () => updateDoc(doc(actors.admin.firestore, 'usuarios', USERS.musico.uid), { permissionOverrides: { 'songs.delete': true } }));
  await denied('SEC-TEAM-003', () => setDoc(doc(actors.admin.firestore, 'sistema', 'permissionRoles'), { roleDefaults: {} }));
  await denied('SEC-TEAM-005', () => updateDoc(doc(actors.musico.firestore, 'usuarios', USERS.musico.uid), { rol: 'dueno' }));
  await denied('SEC-TEAM-006', () => updateDoc(doc(actors.musico.firestore, 'usuarios', USERS.admin.uid), { nombre: 'Bypass' }));
  await allowed('SEC-TEAM-004', async () => {
    await preserveProfile(USERS.cantante.uid);
    await actors.owner.callable('updateUserPermissionOverrides', { targetUid: USERS.cantante.uid, permissionOverrides: { 'songs.editChords': true } });
    assert.equal((await userRef(USERS.cantante.uid).get()).get('permissionOverrides')['songs.editChords'], true);
  });

  // SEC-MEDIA: direct library writes remain Rules-gated and use no external upload service.
  const mediaId = e2eId('SEC-MEDIA');
  await allowed('SEC-MEDIA-003', async () => {
    await setDoc(doc(actors.owner.firestore, 'mediaLibrary', mediaId), { titulo: mediaId, status: 'active', source: 'library' });
    await updateDoc(doc(actors.owner.firestore, 'mediaLibrary', mediaId), { titulo: `${mediaId}-edit` });
    await deleteDoc(doc(actors.owner.firestore, 'mediaLibrary', mediaId));
  });
  await denied('SEC-MEDIA-003-DENY', () => setDoc(doc(actors.musico.firestore, 'mediaLibrary', e2eId('SEC-MEDIA-DENY')), { titulo: e2eId('SEC-MEDIA-DENY') }));

  // SEC-CANVA: callables authenticate the actor before modifying projector routes.
  const canvaId = e2eId('SEC-CANVA');
  await adminDb.collection('canvaPresentations').doc(canvaId).set(savedCanva(event.id, canvaId));
  resources.push({ collectionName: 'canvaPresentations', id: canvaId });
  const canvaRequest = { eventId: event.id, canvaId, page: 1, destinations: ['projector'], requestId: e2eId('SEC-CANVA-REQUEST') };
  await denied('SEC-CANVA-005', () => actors.musico.callable('projectSavedCanva', canvaRequest));
  const projected = await actors.owner.callable('projectSavedCanva', canvaRequest);
  matrix.push({ id: 'SEC-CANVA-004', expected: 'ALLOWED', result: 'PASS' });
  await denied('SEC-CANVA-007', () => actors.musico.callable('restoreProjectionUndo', { eventId: event.id, operationId: projected.operationId }));
  await denied('SEC-CANVA-006', () => actors.musico.callable('projectTemporaryCanva', {
    eventId: event.id, rawUrl: 'https://www.canva.com/design/DAFsecurity/view', title: 'Temporal E2E-QA', page: 1, pageCount: 1,
    destinations: ['projector'], requestId: e2eId('SEC-CANVA-TEMP'),
  }));

  // SEC-QMSG: callable-only quick message paths reject actors without bible.quickProjection.
  await denied('SEC-QMSG-001-DENY', () => actors.musico.callable('projectQuickMessage', callablePayload(event.id)));
  const quick = await actors.owner.callable('projectQuickMessage', callablePayload(event.id));
  matrix.push({ id: 'SEC-QMSG-001', expected: 'ALLOWED', result: 'PASS' });
  await denied('SEC-QMSG-002-DENY', () => actors.musico.callable('clearQuickMessageProjection', { eventoId: event.id, projectionActionId: quick.projectionActionId }));
  await denied('SEC-QMSG-003-DENY', () => actors.musico.callable('updateQuickMessageHistory', { eventoId: event.id, operation: 'clear' }));
  await allowed('SEC-QMSG-002', () => actors.owner.callable('clearQuickMessageProjection', { eventoId: event.id, projectionActionId: quick.projectionActionId }));

  // SEC-SERMON: shared preaching documents are Rules-gated by the actual role defaults.
  const sermonId = e2eId('SEC-SERMON');
  await allowed('SEC-SERMON-001', async () => {
    await setDoc(doc(actors.pastor.firestore, 'predicas', sermonId), { titulo: sermonId, preacherId: USERS.pastor.uid, preacherType: 'user' });
    await updateDoc(doc(actors.pastor.firestore, 'predicas', sermonId), { titulo: `${sermonId}-edit` });
  });
  await denied('SEC-SERMON-003', () => updateDoc(doc(actors.predicador.firestore, 'predicas', sermonId), { titulo: 'Bypass' }));
  resources.push({ collectionName: 'predicas', id: sermonId });

  // SEC-BOOT: the authenticated actor cannot forge an elevated self-profile.
  const forgedId = USERS.musico.uid;
  await denied('SEC-BOOT-002', () => updateDoc(doc(actors.musico.firestore, 'usuarios', forgedId), { rol: 'admin', permissionOverrides: { 'songs.delete': true } }));

  // SEC-ACCOUNT: backend authorization follows the same explicit status contract as the UI.
  await preserveProfile(USERS.musico.uid);
  await userRef(USERS.musico.uid).update({ accountStatus: 'suspended', permissionOverrides: { 'songs.editLyrics': true } });
  await denied('SEC-ACCOUNT-005', () => actors.musico.callable('updateSongLyrics', { songId: song.id, letraRaw: '[D]Suspendido' }));
  await denied('SEC-ACCOUNT-005C', () => actors.musico.callable('updateSongContent', { songId: song.id, letraRaw: '[D]Suspendido contenido' }));
  await denied('SEC-ACCOUNT-005D', () => actors.musico.callable('projectSavedCanva', {
    ...canvaRequest,
    requestId: e2eId('SEC-ACCOUNT-CANVA'),
  }));
  await denied('SEC-ACCOUNT-005E', () => actors.musico.callable('projectQuickMessage', callablePayload(event.id)));
  await denied('SEC-ACCOUNT-006', () => updateDoc(doc(actors.musico.firestore, 'usuarios', USERS.musico.uid), { accountStatus: 'active' }));

  await preserveProfile(USERS.owner.uid);
  await userRef(USERS.owner.uid).update({ accountStatus: 'suspended' });
  await denied('SEC-ACCOUNT-FS-001', () => updateDoc(doc(actors.owner.firestore, 'canciones', song.id), { artista: 'Bypass suspended owner' }));
  await denied('SEC-ACCOUNT-FS-002', () => updateDoc(doc(actors.owner.firestore, 'eventos', event.id), { lugar: 'Bypass suspended owner' }));
  await denied('SEC-ACCOUNT-FS-003', () => setDoc(doc(actors.owner.firestore, 'mediaLibrary', e2eId('SEC-ACCOUNT-MEDIA')), { titulo: e2eId('SEC-ACCOUNT-MEDIA') }));
  await denied('SEC-ACCOUNT-OWNER-DENY', () => actors.owner.callable('updateSongLyrics', { songId: song.id, letraRaw: '[D]Owner suspendido' }));

  await userRef(USERS.owner.uid).update({ accountStatus: 'disabled' });
  await denied('SEC-ACCOUNT-005B', () => actors.owner.callable('updateSongLyrics', { songId: song.id, letraRaw: '[D]Owner desactivado' }));
  await denied('SEC-ACCOUNT-FS-004', () => updateDoc(doc(actors.owner.firestore, 'canciones', song.id), { artista: 'Bypass disabled owner' }));

  await userRef(USERS.owner.uid).update({ accountStatus: 'active' });
  await allowed('SEC-ACCOUNT-FS-005', () => updateDoc(doc(actors.owner.firestore, 'canciones', song.id), { artista: 'Owner activo permitido' }));
  await denied('SEC-ACCOUNT-007', () => updateDoc(doc(actors.admin.firestore, 'usuarios', USERS.musico.uid), { accountStatus: 'active' }));
  await allowed('SEC-ACCOUNT-008', () => updateDoc(doc(actors.owner.firestore, 'usuarios', USERS.musico.uid), { accountStatus: 'active' }));
  await allowed('SEC-ACCOUNT-009', () => actors.musico.callable('updateSongLyrics', { songId: song.id, letraRaw: '[D]Reactivado' }));

  await userRef(USERS.musico.uid).update({ permissionOverrides: { 'songs.editLyrics': true } });
  await userRef(USERS.musico.uid).update({ accountStatus: admin.firestore.FieldValue.delete() });
  await allowed('SEC-ACCOUNT-LEGACY-001', () => actors.musico.callable('updateSongLyrics', { songId: song.id, letraRaw: '[D]Legacy activo' }));
  await userRef(USERS.musico.uid).update({ accountStatus: 'unexpected-status' });
  await denied('SEC-ACCOUNT-LEGACY-002', () => actors.musico.callable('updateSongLyrics', { songId: song.id, letraRaw: '[D]Estado invalido' }));
  await userRef(USERS.musico.uid).update({ accountStatus: 'Suspendida' });
  await denied('SEC-ACCOUNT-LEGACY-003-SUSPENDED', () => actors.musico.callable('updateSongLyrics', { songId: song.id, letraRaw: '[D]Alias suspendido' }));
  await userRef(USERS.musico.uid).update({ accountStatus: 'Desactivada' });
  await denied('SEC-ACCOUNT-LEGACY-003-DISABLED', () => actors.musico.callable('updateSongLyrics', { songId: song.id, letraRaw: '[D]Alias desactivado' }));

  console.table(matrix);
  console.log(`phase 6 security matrix: ${matrix.length} PASS`);
} finally {
  await restoreProfiles();
  await Promise.all(resources.reverse().map(({ collectionName, id }) => deleteE2EResource(collectionName, id)));
  await Promise.all(Object.values(actors).map((actor) => actor.close()));
}

