/* global module, require */
const { createHash } = require('crypto');
const { validateSidecar, stableSerialize } = require('./lyricFormattingPersistence');

const REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/;
const SONG_ID = /^[^/\s][^/]{0,255}$/;
const SONG_FIELDS = Object.freeze([
  'titulo', 'artista', 'tonoOriginal', 'tonosAlternativos', 'tonosPorCantante',
  'etiquetas', 'bpm', 'letraRaw', 'letra', 'lyrics', 'contenido', 'youtubeUrl',
  'audioUrl', 'fondoUrl', 'fondoMediaId', 'projectionStyle', 'recursos',
  'multitracks', 'sectionMedia', 'transposeMode', 'cancionesOrigen', 'medleyConfig',
  'lyricFormatting',
]);
const RESOURCE_FIELDS = Object.freeze({
  recursos: ['id', 'titulo', 'tipo', 'url', 'instrumento'],
  multitracks: ['id', 'nombre', 'url', 'fileName'],
  sectionMedia: ['id', 'mediaId', 'title', 'name', 'type', 'url', 'thumbnailUrl', 'provider', 'source', 'sectionTitle'],
});

class SongDuplicationError extends Error {
  constructor(code, details = {}) {
    super(code);
    this.name = 'SongDuplicationError';
    this.code = code;
    this.details = details;
  }
}

const fail = (condition, code, details) => {
  if (!condition) throw new SongDuplicationError(code, details);
};
const isPlainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const clone = value => value === undefined ? undefined : structuredClone(value);
const hash = value => createHash('sha256').update(value, 'utf8').digest('hex');
const operationId = (songId, requestId) => hash(`${songId}:${requestId}`);
const targetSongId = (actorUid, songId, requestId) => `copy_${hash(`${actorUid}:${songId}:${requestId}`).slice(0, 40)}`;

const validateInput = data => {
  fail(isPlainObject(data) && Object.keys(data).length === 2, 'invalid-argument');
  fail(SONG_ID.test(String(data.songId || '')), 'invalid-argument');
  fail(REQUEST_ID.test(String(data.requestId || '')), 'invalid-argument');
  return { songId: data.songId, requestId: data.requestId };
};

const copyResource = (resource, fields, id) => {
  fail(isPlainObject(resource), 'invalid-song');
  const result = Object.fromEntries(fields.filter(field => field !== 'id' && Object.hasOwn(resource, field))
    .map(field => [field, clone(resource[field])]));
  return { id, ...result };
};

const cloneResourceList = (value, field, targetId, prefix) => {
  if (value === undefined) return undefined;
  fail(Array.isArray(value), 'invalid-song');
  return value.map((resource, index) => copyResource(
    resource,
    RESOURCE_FIELDS[field],
    `dup_${hash(`${targetId}:${prefix}:${index}:${String(resource?.id || '')}`).slice(0, 24)}`,
  ));
};

const cloneSectionMedia = (value, targetId) => {
  if (value === undefined) return undefined;
  fail(isPlainObject(value), 'invalid-song');
  return Object.fromEntries(Object.entries(value).map(([sectionKey, resources]) => {
    fail(typeof sectionKey === 'string' && Array.isArray(resources), 'invalid-song');
    return [sectionKey, resources.map((resource, index) => copyResource(
      resource,
      RESOURCE_FIELDS.sectionMedia,
      `dup_${hash(`${targetId}:section:${sectionKey}:${index}:${String(resource?.id || '')}`).slice(0, 24)}`,
    ))];
  }));
};

const buildCopy = ({ source, actorUid, targetId, now }) => {
  fail(isPlainObject(source), 'invalid-song');
  const lyrics = typeof source.letraRaw === 'string'
    ? source.letraRaw
    : [source.letra, source.lyrics, source.contenido].find(value => typeof value === 'string') || '';
  fail(typeof lyrics === 'string' && lyrics.length <= 100000, 'invalid-song');
  const sidecar = validateSidecar(source.lyricFormatting, lyrics);
  const copy = Object.fromEntries(SONG_FIELDS.filter(field => Object.hasOwn(source, field))
    .map(field => [field, clone(source[field])]));
  copy.titulo = `${String(source.titulo || 'Cancion').trim() || 'Cancion'} (Copia)`;
  if (Object.hasOwn(source, 'recursos')) copy.recursos = cloneResourceList(source.recursos, 'recursos', targetId, 'resource');
  if (Object.hasOwn(source, 'multitracks')) copy.multitracks = cloneResourceList(source.multitracks, 'multitracks', targetId, 'multitrack');
  if (Object.hasOwn(source, 'sectionMedia')) copy.sectionMedia = cloneSectionMedia(source.sectionMedia, targetId);
  if (Object.hasOwn(source, 'lyricFormatting')) copy.lyricFormatting = sidecar;
  copy.fechaCreacion = new Date(now).toISOString();
  copy.fechaActualizacion = new Date(now).toISOString();
  copy.creadoPor = actorUid;
  copy.duplicadaDe = source.id;
  copy.duplicadaPor = actorUid;
  return copy;
};

const collectMediaUsages = (songId, song) => Object.entries(song.sectionMedia || {}).flatMap(([sectionKey, resources]) => (
  Array.isArray(resources) ? resources.filter(resource => typeof resource?.mediaId === 'string' && resource.mediaId)
    .map(resource => ({
      mediaId: resource.mediaId,
      usage: {
        songId,
        songTitle: song.titulo,
        location: 'section',
        sectionKey,
        sectionTitle: resource.sectionTitle || sectionKey,
        resourceId: resource.id,
      },
    })) : []
));

const createSongDuplicationService = ({ repository, now = Date.now }) => {
  fail(repository?.runTransaction, 'repository-required');
  const duplicate = async ({ auth, data }) => {
    fail(auth?.uid, 'unauthenticated');
    const request = validateInput(data);
    const fingerprint = hash(stableSerialize(request));
    const destinationId = targetSongId(auth.uid, request.songId, request.requestId);

    return repository.runTransaction(async transaction => {
      const actor = await transaction.getActorAuthorization(auth.uid);
      fail(actor, 'permission-denied');
      fail(actor.accountStatus === undefined || actor.accountStatus === 'active' || actor.accountStatus === 'Activa', 'permission-denied');
      fail(actor.permissions?.includes('songs.create'), 'permission-denied');

      const existing = await transaction.getOperation(request.songId, request.requestId);
      if (existing) {
        fail(existing.actorUid === auth.uid && existing.fingerprint === fingerprint, 'idempotency-conflict');
        return { ...existing.result, idempotent: true };
      }

      const source = await transaction.getSong(request.songId);
      fail(source, 'song-not-found');
      const copy = buildCopy({ source, actorUid: auth.uid, targetId: destinationId, now: now() });
      const usages = collectMediaUsages(destinationId, copy);
      const mediaRecords = new Map();
      for (const { mediaId } of usages) {
        if (!mediaRecords.has(mediaId)) {
          const media = await transaction.getMedia(mediaId);
          fail(media, 'media-not-found', { mediaId });
          mediaRecords.set(mediaId, media);
        }
      }
      fail(!(await transaction.songExists(destinationId)), 'destination-conflict');

      const timestamp = now();
      await transaction.createSong(destinationId, copy);
      for (const [mediaId, media] of mediaRecords) {
        const additions = usages.filter(item => item.mediaId === mediaId).map(item => item.usage);
        const current = Array.isArray(media.usedBy) ? media.usedBy : [];
        const next = [...current.filter(item => !additions.some(addition => (
          (item.songId || item.entityId) === addition.songId && item.location === addition.location
          && (item.sectionKey || '') === addition.sectionKey && (item.resourceId || '') === addition.resourceId
        ))), ...additions];
        await transaction.updateMedia(mediaId, {
          usedBy: next,
          usageCount: next.length,
          firstUsedAt: media.firstUsedAt || timestamp,
          lastUsedAt: timestamp,
          updatedAt: timestamp,
        });
      }
      const result = { ok: true, songId: destinationId, sourceSongId: request.songId, idempotent: false };
      await transaction.createOperation(request.songId, request.requestId, {
        version: 1,
        actorUid: auth.uid,
        sourceSongId: request.songId,
        requestId: request.requestId,
        fingerprint,
        result,
        completedAt: timestamp,
      });
      await transaction.appendAudit(destinationId, {
        actorUid: auth.uid,
        action: 'songs.duplicate',
        permission: 'songs.create',
        sourceSongId: request.songId,
        requestId: request.requestId,
        formattingCopied: copy.lyricFormatting !== undefined && copy.lyricFormatting !== null,
        timestamp,
      });
      return result;
    });
  };
  return { duplicate };
};

module.exports = {
  SongDuplicationError,
  SONG_FIELDS,
  buildCopy,
  collectMediaUsages,
  createSongDuplicationService,
  operationId,
  targetSongId,
  validateInput,
};
