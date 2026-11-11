import { createRequire } from 'node:module';
import process from 'node:process';

const EMULATOR_HOST = '127.0.0.1:8080';
const E2E_PREFIX = 'E2E-QA-';
const E2E_CONTROLLER_EVENT_ID = 'e2e-controller-event';
const E2E_CANVA_EVENT_ID = 'e2e-canva-event';
const E2E_PROJECT_ID = 'demo-kadosh-e2e';
const require = createRequire(import.meta.url);
const admin = require('../../functions/node_modules/firebase-admin');

function assertFirestoreEmulator() {
  if (process.env.FIRESTORE_EMULATOR_HOST !== EMULATOR_HOST) {
    throw new Error(`E2E bloqueado: FIRESTORE_EMULATOR_HOST debe ser ${EMULATOR_HOST}.`);
  }
  if (process.env.KADOSH_E2E_PROJECT_ID !== E2E_PROJECT_ID) {
    throw new Error(`E2E bloqueado: KADOSH_E2E_PROJECT_ID debe ser ${E2E_PROJECT_ID}.`);
  }
}

assertFirestoreEmulator();

const app = admin.apps.find((candidate) => candidate?.name === 'e2e-firestore-admin')
  || admin.initializeApp({ projectId: E2E_PROJECT_ID }, 'e2e-firestore-admin');
const db = app.firestore();

function assertE2EValue(value, label) {
  if (typeof value !== 'string' || !value.startsWith(E2E_PREFIX)) {
    throw new Error(`E2E bloqueado: ${label} debe comenzar con ${E2E_PREFIX}.`);
  }
}

function assertE2EUserId(uid) {
  if (typeof uid !== 'string' || !uid.startsWith('e2e-')) {
    throw new Error('E2E bloqueado: solo se pueden modificar perfiles e2e-.');
  }
}

export function e2eId(kind) {
  return `${E2E_PREFIX}${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function readFirestoreDocument(collectionName, id) {
  assertFirestoreEmulator();
  const snapshot = await db.collection(collectionName).doc(id).get();
  return snapshot.exists ? { id: snapshot.id, ...snapshot.data() } : null;
}

export async function updateControllerE2EEvent(changes) {
  assertFirestoreEmulator();
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) {
    throw new Error('E2E bloqueado: los cambios del evento controlador deben ser un objeto.');
  }
  await db.collection('eventos').doc(E2E_CONTROLLER_EVENT_ID).update(changes);
}

export async function setE2EMultimediaVault(vault) {
  assertFirestoreEmulator();
  if (vault === null) {
    await db.collection('sistema').doc('multimedia').delete();
    return;
  }
  if (!vault || typeof vault !== 'object' || Array.isArray(vault)) {
    throw new Error('E2E bloqueado: la bóveda debe ser un objeto.');
  }
  const media = vault.multimediaLib || [];
  if (!Array.isArray(media) || media.some((item) => !String(item?.name || '').startsWith(E2E_PREFIX))) {
    throw new Error('E2E bloqueado: la bóveda solo puede contener recursos E2E-QA-.');
  }
  await db.collection('sistema').doc('multimedia').set(vault);
}

export async function resetControllerE2EEvent(eventData) {
  assertFirestoreEmulator();
  if (!eventData || eventData.titulo !== 'E2E-QA-CONTROLLER EVENT') {
    throw new Error('E2E bloqueado: solo se puede restaurar el evento controlador aislado.');
  }
  await db.collection('eventos').doc(E2E_CONTROLLER_EVENT_ID).set(eventData);
}

export async function readCanvaE2EEvent() {
  assertFirestoreEmulator();
  const snapshot = await db.collection('eventos').doc(E2E_CANVA_EVENT_ID).get();
  return snapshot.exists ? { id: snapshot.id, ...snapshot.data() } : null;
}

export async function resetCanvaE2EEvent(eventData) {
  assertFirestoreEmulator();
  if (!eventData || eventData.titulo !== 'E2E Canva aislado') {
    throw new Error('E2E bloqueado: solo se puede restaurar el evento Canva aislado.');
  }
  await db.collection('eventos').doc(E2E_CANVA_EVENT_ID).set(eventData);
}

export async function readE2EUserProfile(uid) {
  assertFirestoreEmulator();
  assertE2EUserId(uid);
  const snapshot = await db.collection('usuarios').doc(uid).get();
  if (!snapshot.exists) throw new Error(`Perfil E2E no encontrado: ${uid}.`);
  return snapshot.data();
}

export async function updateE2EUserProfile(uid, changes) {
  assertFirestoreEmulator();
  assertE2EUserId(uid);
  await db.collection('usuarios').doc(uid).update(changes);
}

export async function restoreE2EUserProfile(uid, profile) {
  assertFirestoreEmulator();
  assertE2EUserId(uid);
  await db.collection('usuarios').doc(uid).set(profile);
}

export async function setE2EUserNote(uid, noteId, data) {
  assertFirestoreEmulator();
  assertE2EUserId(uid);
  if (!String(noteId).startsWith('e2e-')) throw new Error('La nota E2E debe usar id e2e-.');
  await db.collection('usuarios').doc(uid).collection('notas').doc(noteId).set(data);
}

export async function readE2EUserNote(uid, noteId) {
  assertFirestoreEmulator();
  assertE2EUserId(uid);
  if (!String(noteId).startsWith('e2e-')) throw new Error('La nota E2E debe usar id e2e-.');
  const snapshot = await db.collection('usuarios').doc(uid).collection('notas').doc(noteId).get();
  return snapshot.exists ? snapshot.data() : null;
}

export async function deleteE2EUserNote(uid, noteId) {
  assertFirestoreEmulator();
  assertE2EUserId(uid);
  if (!String(noteId).startsWith('e2e-')) throw new Error('La nota E2E debe usar id e2e-.');
  await db.collection('usuarios').doc(uid).collection('notas').doc(noteId).delete();
}

export async function findFirestoreDocumentsByTitle(collectionName, titulo) {
  assertFirestoreEmulator();
  assertE2EValue(titulo, `titulo de ${collectionName}`);
  const snapshot = await db.collection(collectionName).where('titulo', '==', titulo).get();
  return snapshot.docs.map((document) => ({ id: document.id, ...document.data() }));
}

export async function createE2ESong(overrides = {}) {
  assertFirestoreEmulator();
  const titulo = overrides.titulo || e2eId('SONG');
  assertE2EValue(titulo, 'titulo de cancion');
  const ref = db.collection('canciones').doc();
  await ref.set({
    titulo,
    artista: 'Artista E2E-QA',
    tonoOriginal: 'C',
    bpm: 100,
    letraRaw: '[C]Letra inicial',
    etiquetas: [],
    estado: 'active',
    archived: false,
    fechaCreacion: new Date().toISOString(),
    ...overrides,
  });
  return { id: ref.id, titulo };
}

export async function createE2ESongWithId(id, overrides = {}) {
  assertFirestoreEmulator();
  if (typeof id !== 'string' || !id.startsWith('e2e-')) {
    throw new Error('E2E bloqueado: el id fijo de cancion debe comenzar con e2e-.');
  }
  const titulo = overrides.titulo || e2eId('SONG-FIXED');
  assertE2EValue(titulo, 'titulo de cancion con id fijo');
  const ref = db.collection('canciones').doc(id);
  if ((await ref.get()).exists) throw new Error(`E2E bloqueado: el fixture ${id} ya existe.`);
  await ref.create({
    titulo,
    artista: 'Artista E2E-QA',
    tonoOriginal: 'C',
    bpm: 100,
    letraRaw: '[C]Fixture de limpieza',
    etiquetas: [],
    estado: 'active',
    archived: false,
    fechaCreacion: new Date().toISOString(),
    ...overrides,
  });
  return { id, titulo };
}

export async function createE2EEvent(overrides = {}) {
  assertFirestoreEmulator();
  const titulo = overrides.titulo || e2eId('EVENT');
  assertE2EValue(titulo, 'titulo de evento');
  const ref = db.collection('eventos').doc();
  await ref.set({
    titulo,
    fecha: '2026-12-20T10:00',
    tipoEvento: 'Servicio Dominical',
    lugar: 'E2E Emulator',
    notas: '',
    setlist: [],
    canciones: [],
    equipo: [],
    estado: 'programado',
    completado: false,
    fechaCreacion: new Date().toISOString(),
    ...overrides,
  });
  return { id: ref.id, titulo };
}

export async function createE2EMedia(overrides = {}) {
  assertFirestoreEmulator();
  const title = overrides.title || e2eId('MEDIA');
  assertE2EValue(title, 'titulo de media');
  const ref = db.collection('mediaLibrary').doc();
  await ref.set({
    title,
    name: title,
    type: 'image',
    url: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==',
    thumbnailUrl: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==',
    provider: 'url',
    source: 'library',
    status: 'active',
    usedBy: [],
    usageCount: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  });
  return { id: ref.id, title };
}

export async function updateE2EMedia(mediaId, changes) {
  assertFirestoreEmulator();
  const media = await readFirestoreDocument('mediaLibrary', mediaId);
  if (!media) throw new Error(`Recurso E2E no encontrado: ${mediaId}.`);
  assertE2EValue(media.title || media.name, `mediaLibrary/${mediaId}`);
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) {
    throw new Error('E2E bloqueado: los cambios multimedia deben ser un objeto.');
  }
  await db.collection('mediaLibrary').doc(mediaId).update(changes);
}

export async function updateE2EEvent(eventId, changes) {
  assertFirestoreEmulator();
  const event = await readFirestoreDocument('eventos', eventId);
  if (!event) throw new Error(`Evento E2E no encontrado: ${eventId}.`);
  assertE2EValue(event.titulo, `eventos/${eventId}`);
  await db.collection('eventos').doc(eventId).update(changes);
}

export async function getSongAudit(songId) {
  assertFirestoreEmulator();
  const snapshot = await db.collection('canciones').doc(songId).collection('permissionAudit').get();
  return snapshot.docs.map((document) => ({ id: document.id, ...document.data() }));
}

export async function deleteE2EResource(collectionName, id) {
  assertFirestoreEmulator();
  const ref = db.collection(collectionName).doc(id);
  const snapshot = await ref.get();
  if (!snapshot.exists) return;
  const data = snapshot.data() || {};
  const identifier = typeof data.titulo === 'string'
    ? data.titulo
    : (typeof data.title === 'string' ? data.title : (typeof data.name === 'string' ? data.name : id));
  assertE2EValue(identifier, `${collectionName}/${id}`);
  await db.recursiveDelete(ref);
}

export async function deleteE2EMedley(id, expectedSourceIds) {
  assertFirestoreEmulator();
  if (!Array.isArray(expectedSourceIds) || expectedSourceIds.length < 2) {
    throw new Error('E2E bloqueado: un Medley de prueba debe declarar al menos dos fuentes esperadas.');
  }

  const ref = db.collection('canciones').doc(id);
  const snapshot = await ref.get();
  if (!snapshot.exists) return;

  const medley = snapshot.data() || {};
  const sourceIds = medley.cancionesOrigen;
  if (!Array.isArray(sourceIds) || sourceIds.length !== expectedSourceIds.length
    || sourceIds.some((sourceId, index) => sourceId !== expectedSourceIds[index])) {
    throw new Error(`E2E bloqueado: canciones/${id} no coincide con el Medley generado por esta prueba.`);
  }

  const sourceSnapshots = await Promise.all(sourceIds.map((sourceId) => db.collection('canciones').doc(sourceId).get()));
  sourceSnapshots.forEach((sourceSnapshot) => {
    if (!sourceSnapshot.exists) throw new Error('E2E bloqueado: una fuente del Medley ya no existe.');
    assertE2EValue(sourceSnapshot.data()?.titulo, `fuente del Medley ${sourceSnapshot.id}`);
  });

  await db.recursiveDelete(ref);
}
