import { createHash } from 'node:crypto';

export const BACKUP_SCHEMA_VERSION = 1;
export const SOURCE_PROJECT_ID = 'kadosh-49600';
export const DEMO_PROJECT_ID = 'demo-kadosh-e2e';

const STYLE_VALUES = Object.freeze({
  preset: new Set(['clean', 'cinematic', 'worship', 'impact', 'minimal']),
  motion: new Set(['none', 'soft', 'dynamic']),
  alignment: new Set(['left', 'center', 'right']),
  backgroundTreatment: new Set(['auto', 'normal']),
});

const SONG_FIELDS = [
  'titulo', 'artista', 'letraRaw', 'tonoOriginal', 'etiquetas', 'bpm',
  'projectionStyle', 'medleyConfig', 'sectionMedia', 'archived',
];
const EVENT_FIELDS = [
  'titulo', 'fecha', 'fechaEnsayo', 'tipoEvento', 'setlist', 'canciones',
  'songProjectionStyleOverrides', 'historicalSongSnapshots',
];
const SECTION_MEDIA_FIELDS = [
  'id', 'mediaId', 'title', 'name', 'type', 'provider', 'source', 'sectionTitle',
];
const MEDLEY_FIELDS = [
  'materializationVersion', 'transposeMode', 'unifiedKey', 'tonalProgression',
  'songs', 'sectionPartIndexes', 'manualEdited',
];
const MEDLEY_SONG_FIELDS = ['songId', 'title', 'originalKey', 'medleyKey', 'materializedKey'];
const FORBIDDEN_KEYS = new Set([
  'email', 'telefono', 'phone', 'photoURL', 'avatar', 'fcmToken', 'ultimaConexion',
  'uid', 'userId', 'ownerUid', 'actorUid', 'createdByUid', 'updatedBy', 'creadoPor',
  'canceladoPor', 'equipo', 'estadoAsistencia', 'cantantesPorCancion',
  'cantantesPorCanción', 'corosPorCancion', 'corosPorCanción', 'responsables',
  'predicadorId', 'predicadorNombre', 'predicadorAsignado', 'comentarios', 'notas',
  'projectorState', 'liveState', 'outputs', 'announcementState', 'proyectorMedia',
  'proyectorSlide', 'proyectorApagado', 'proyectorCountdown', 'proyectorAlerta',
  'proyectorTicker', 'permissionAudit', 'url', 'thumbnailUrl', 'storagePath',
  'cloudinaryPublicId', 'youtubeUrl', 'audioUrl', 'fondoUrl', 'fondoMediaId',
  'tonosAlternativos', 'tonosPorCantante',
]);

const isPlainObject = (value) => value !== null && typeof value === 'object'
  && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;

export function serializeFirestoreValue(value) {
  if (value == null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map(serializeFirestoreValue);
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    return { $type: 'bytes', value: Buffer.from(value).toString('base64') };
  }
  if (typeof value.toDate === 'function' && typeof value.seconds === 'number') {
    return { $type: 'timestamp', value: value.toDate().toISOString() };
  }
  if (typeof value.latitude === 'number' && typeof value.longitude === 'number') {
    return { $type: 'geopoint', latitude: value.latitude, longitude: value.longitude };
  }
  if (typeof value.path === 'string' && value.firestore) {
    return { $type: 'reference', path: value.path };
  }
  return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, serializeFirestoreValue(nested)]));
}

export function decodeFirestoreValue(value, firestoreTypes = {}) {
  if (Array.isArray(value)) return value.map((item) => decodeFirestoreValue(item, firestoreTypes));
  if (!isPlainObject(value)) return value;
  if (value.$type === 'timestamp') {
    if (!firestoreTypes.Timestamp) throw new Error('Timestamp decoder is unavailable.');
    return firestoreTypes.Timestamp.fromDate(new Date(value.value));
  }
  if (value.$type === 'geopoint') {
    if (!firestoreTypes.GeoPoint) throw new Error('GeoPoint decoder is unavailable.');
    return new firestoreTypes.GeoPoint(value.latitude, value.longitude);
  }
  if (value.$type === 'bytes') return Buffer.from(value.value, 'base64');
  if (value.$type === 'reference') {
    throw new Error(`DocumentReference is not supported in Projection V2 backups: ${value.path}`);
  }
  return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, decodeFirestoreValue(nested, firestoreTypes)]));
}

function pick(source, fields) {
  return Object.fromEntries(fields.filter((field) => Object.hasOwn(source || {}, field))
    .map((field) => [field, serializeFirestoreValue(source[field])]));
}

function sanitizeSectionMedia(sectionMedia) {
  if (!isPlainObject(sectionMedia)) return {};
  return Object.fromEntries(Object.entries(sectionMedia).map(([section, resources]) => [
    section,
    Array.isArray(resources) ? resources.map((resource) => pick(resource, SECTION_MEDIA_FIELDS)) : [],
  ]));
}

function sanitizeSetlist(setlist) {
  if (!Array.isArray(setlist)) return [];
  return setlist.flatMap((item, index) => {
    const songId = item?.value || item?.songId || item?.id;
    if ((item?.type || 'song') !== 'song' || typeof songId !== 'string' || !songId) return [];
    return [{ idLocal: `projection-v2-${index}-${songId}`, type: 'song', value: songId }];
  });
}

function sanitizeSongReferences(canciones) {
  if (!Array.isArray(canciones)) return [];
  return canciones.map((item) => typeof item === 'string' ? item : item?.id || item?.songId || item?.value)
    .filter((songId) => typeof songId === 'string' && songId);
}

function sanitizeMedleyConfig(config) {
  if (!isPlainObject(config)) return undefined;
  const sanitized = pick(config, MEDLEY_FIELDS);
  sanitized.songs = Array.isArray(config.songs)
    ? config.songs.map((song) => pick(song, MEDLEY_SONG_FIELDS))
    : [];
  return sanitized;
}

export function sanitizeSong(id, data) {
  const sanitized = pick(data, SONG_FIELDS);
  if (Object.hasOwn(sanitized, 'sectionMedia')) sanitized.sectionMedia = sanitizeSectionMedia(data.sectionMedia);
  if (Object.hasOwn(sanitized, 'medleyConfig')) sanitized.medleyConfig = sanitizeMedleyConfig(data.medleyConfig);
  return { id, data: sanitized };
}

export function sanitizeEvent(id, data) {
  const sanitized = pick(data, EVENT_FIELDS);
  if (Object.hasOwn(sanitized, 'setlist')) sanitized.setlist = sanitizeSetlist(data.setlist);
  if (Object.hasOwn(sanitized, 'canciones')) sanitized.canciones = sanitizeSongReferences(data.canciones);
  if (isPlainObject(data?.historicalSongSnapshots)) {
    sanitized.historicalSongSnapshots = Object.fromEntries(Object.entries(data.historicalSongSnapshots)
      .map(([songId, song]) => [songId, sanitizeSong(songId, song).data]));
  }
  return { id, data: sanitized };
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

export const stableStringify = (value) => JSON.stringify(stableValue(value));
export const sha256 = (value) => createHash('sha256').update(typeof value === 'string' ? value : stableStringify(value)).digest('hex');

export function createBackup({ songs, events, createdAt = new Date().toISOString() }) {
  const collections = { canciones: songs, eventos: events };
  const collectionManifest = Object.fromEntries(Object.entries(collections).map(([name, documents]) => [name, {
    count: documents.length,
    sha256: sha256(documents),
  }]));
  const manifest = {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    sourceProject: SOURCE_PROJECT_ID,
    createdAt,
    collections: collectionManifest,
    redactionProfile: 'projection-v2-minimal-v2',
  };
  manifest.sha256 = sha256({ manifest, collections });
  return { manifest, collections };
}

function validateStyle(style, path, errors) {
  if (!isPlainObject(style)) return errors.push(`${path} must be an object.`);
  for (const [field, allowed] of Object.entries(STYLE_VALUES)) {
    if (!allowed.has(style[field])) errors.push(`${path}.${field} is invalid.`);
  }
  const allowedKeys = new Set(Object.keys(STYLE_VALUES));
  for (const key of Object.keys(style)) if (!allowedKeys.has(key)) errors.push(`${path}.${key} is not allowed.`);
}

function validateAllowedKeys(value, allowed, path, errors) {
  if (!isPlainObject(value)) return;
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) if (!allowedSet.has(key)) errors.push(`${path}.${key} is not allowed.`);
}

function validateMedleyConfig(config, path, errors) {
  if (!isPlainObject(config)) return errors.push(`${path} must be an object.`);
  validateAllowedKeys(config, MEDLEY_FIELDS, path, errors);
  if (!Array.isArray(config.songs)) errors.push(`${path}.songs must be an array.`);
  else config.songs.forEach((song, index) => validateAllowedKeys(song, MEDLEY_SONG_FIELDS, `${path}.songs[${index}]`, errors));
}

function validateSongData(data, path, errors) {
  if (!isPlainObject(data)) return errors.push(`${path} must be an object.`);
  validateAllowedKeys(data, SONG_FIELDS, path, errors);
  if (typeof data.letraRaw !== 'string' || !data.letraRaw.trim()) errors.push(`${path}.letraRaw is required.`);
  if (data.projectionStyle !== undefined) validateStyle(data.projectionStyle, `${path}.projectionStyle`, errors);
  if (data.medleyConfig !== undefined) validateMedleyConfig(data.medleyConfig, `${path}.medleyConfig`, errors);
  if (data.sectionMedia !== undefined) {
    if (!isPlainObject(data.sectionMedia)) errors.push(`${path}.sectionMedia must be an object.`);
    else Object.entries(data.sectionMedia).forEach(([section, resources]) => {
      if (!Array.isArray(resources)) errors.push(`${path}.sectionMedia.${section} must be an array.`);
      else resources.forEach((resource, index) => validateAllowedKeys(
        resource, SECTION_MEDIA_FIELDS, `${path}.sectionMedia.${section}[${index}]`, errors,
      ));
    });
  }
}

function scanForbidden(value, path, errors) {
  if (Array.isArray(value)) return value.forEach((item, index) => scanForbidden(item, `${path}[${index}]`, errors));
  if (!isPlainObject(value)) return;
  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key)) errors.push(`${path}.${key} is forbidden.`);
    if (typeof nested === 'string' && /^(?:https?:|gs:|ftp:)/i.test(nested.trim())) {
      errors.push(`${path}.${key} contains an external resource URL.`);
    }
    scanForbidden(nested, `${path}.${key}`, errors);
  }
}

export function validateBackup(backup) {
  const errors = [];
  if (!isPlainObject(backup)) return { ok: false, errors: ['Backup must be an object.'] };
  const { manifest, collections } = backup;
  if (!isPlainObject(manifest)) errors.push('manifest is required.');
  if (manifest?.schemaVersion !== BACKUP_SCHEMA_VERSION) errors.push('manifest.schemaVersion is unsupported.');
  if (manifest?.sourceProject !== SOURCE_PROJECT_ID) errors.push('manifest.sourceProject is invalid.');
  if (manifest?.redactionProfile !== 'projection-v2-minimal-v2') errors.push('manifest.redactionProfile is invalid.');
  if (!isPlainObject(collections)) errors.push('collections is required.');
  const songs = collections?.canciones;
  const events = collections?.eventos;
  if (!Array.isArray(songs)) errors.push('collections.canciones must be an array.');
  if (!Array.isArray(events)) errors.push('collections.eventos must be an array.');
  if (errors.length) return { ok: false, errors };

  for (const [name, documents] of Object.entries({ canciones: songs, eventos: events })) {
    const ids = new Set();
    for (const [index, document] of documents.entries()) {
      const path = `${name}[${index}]`;
      if (!isPlainObject(document) || typeof document.id !== 'string' || !document.id.trim()) errors.push(`${path}.id is required.`);
      else if (ids.has(document.id)) errors.push(`${path}.id is duplicated.`);
      else ids.add(document.id);
      if (!isPlainObject(document?.data)) errors.push(`${path}.data must be an object.`);
      else scanForbidden(document.data, `${path}.data`, errors);
    }
    if (manifest.collections?.[name]?.count !== documents.length) errors.push(`manifest.collections.${name}.count does not match.`);
    if (manifest.collections?.[name]?.sha256 !== sha256(documents)) errors.push(`manifest.collections.${name}.sha256 does not match.`);
  }

  const songIds = new Set(songs.map((song) => song.id));
  songs.forEach((song, index) => {
    validateSongData(song.data, `canciones[${index}].data`, errors);
  });
  events.forEach((event, eventIndex) => {
    const data = event.data;
    if (!isPlainObject(data)) return;
    validateAllowedKeys(data, EVENT_FIELDS, `eventos[${eventIndex}].data`, errors);
    if (data.historicalSongSnapshots !== undefined && !isPlainObject(data.historicalSongSnapshots)) {
      errors.push(`eventos[${eventIndex}].data.historicalSongSnapshots must be an object.`);
    }
    if (data.songProjectionStyleOverrides !== undefined && !isPlainObject(data.songProjectionStyleOverrides)) {
      errors.push(`eventos[${eventIndex}].data.songProjectionStyleOverrides must be an object.`);
    }
    const historical = isPlainObject(data.historicalSongSnapshots) ? data.historicalSongSnapshots : {};
    Object.entries(historical).forEach(([songId, snapshot]) => validateSongData(
      snapshot, `eventos[${eventIndex}].data.historicalSongSnapshots.${songId}`, errors,
    ));
    const referenced = new Set();
    if (Array.isArray(data.setlist)) {
      data.setlist.forEach((item, itemIndex) => {
        validateAllowedKeys(item, ['idLocal', 'type', 'value'], `eventos[${eventIndex}].data.setlist[${itemIndex}]`, errors);
        if (item?.type !== 'song') errors.push(`eventos[${eventIndex}].data.setlist[${itemIndex}].type must be song.`);
        if (item?.type === 'song') {
          const songId = item.value || item.songId || item.id;
          if (!songId) errors.push(`eventos[${eventIndex}].data.setlist[${itemIndex}] has no song id.`);
          else referenced.add(songId);
        }
      });
    }
    if (data.canciones !== undefined && !Array.isArray(data.canciones)) {
      errors.push(`eventos[${eventIndex}].data.canciones must be an array.`);
    }
    if (Array.isArray(data.canciones)) data.canciones.forEach((item, itemIndex) => {
      if (typeof item !== 'string' || !item) errors.push(`eventos[${eventIndex}].data.canciones[${itemIndex}] must be a song id.`);
      else referenced.add(item);
    });
    for (const songId of referenced) {
      if (songId && !songIds.has(songId) && !Object.hasOwn(historical, songId)) errors.push(`eventos[${eventIndex}] references missing song ${songId}.`);
    }
    if (isPlainObject(data.songProjectionStyleOverrides)) {
      for (const [songId, style] of Object.entries(data.songProjectionStyleOverrides)) {
        if (!songIds.has(songId) && !Object.hasOwn(historical, songId)) errors.push(`eventos[${eventIndex}] has override for missing song ${songId}.`);
        validateStyle(style, `eventos[${eventIndex}].data.songProjectionStyleOverrides.${songId}`, errors);
      }
    }
  });
  const expectedBackupHash = sha256({ manifest: { ...manifest, sha256: undefined }, collections });
  if (manifest.sha256 !== expectedBackupHash) errors.push('manifest.sha256 does not match.');
  return { ok: errors.length === 0, errors, counts: { canciones: songs.length, eventos: events.length } };
}

