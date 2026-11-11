/* global module, require */
const { createHash } = require('crypto');

const normalizeRole = role => String(role || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const resolveCreatePermission = (user = {}, roleDefaults = {}) => {
  const role = normalizeRole(user.rol);
  if (role === 'dueno') return true;
  const override = user.permissionOverrides?.['songs.create'];
  if (typeof override === 'boolean') return override;
  const configured = roleDefaults?.[role]?.['songs.create'];
  if (typeof configured === 'boolean') return configured;
  return ['admin', 'multimedia'].includes(role);
};
const operationDocumentId = (songId, requestId) => createHash('sha256').update(`${songId}:${requestId}`, 'utf8').digest('hex');

const createFirestoreSongDuplicationRepository = firestore => {
  if (!firestore?.runTransaction || !firestore?.collection) throw new Error('firestore_required');
  const songs = firestore.collection('canciones');
  const users = firestore.collection('usuarios');
  const permissions = firestore.collection('sistema').doc('permissionRoles');
  const operations = firestore.collection('songDuplicationOperations');
  const media = firestore.collection('mediaLibrary');
  return {
    runTransaction: callback => firestore.runTransaction(async native => callback({
      getActorAuthorization: async uid => {
        const [userSnap, permissionSnap] = await Promise.all([native.get(users.doc(uid)), native.get(permissions)]);
        if (!userSnap.exists) return null;
        const user = userSnap.data() || {};
        const defaults = permissionSnap.exists ? permissionSnap.get('roleDefaults') || {} : {};
        return { accountStatus: user.accountStatus, permissions: resolveCreatePermission(user, defaults) ? ['songs.create'] : [] };
      },
      getSong: async songId => {
        const snap = await native.get(songs.doc(songId));
        return snap.exists ? { id: snap.id, ...snap.data() } : null;
      },
      getOperation: async (songId, requestId) => {
        const snap = await native.get(operations.doc(operationDocumentId(songId, requestId)));
        return snap.exists ? snap.data() : null;
      },
      getMedia: async mediaId => {
        const snap = await native.get(media.doc(mediaId));
        return snap.exists ? { id: snap.id, ...snap.data() } : null;
      },
      songExists: async songId => (await native.get(songs.doc(songId))).exists,
      createSong: async (songId, value) => native.create(songs.doc(songId), value),
      updateMedia: async (mediaId, value) => native.update(media.doc(mediaId), value),
      createOperation: async (songId, requestId, value) => native.create(operations.doc(operationDocumentId(songId, requestId)), value),
      appendAudit: async (songId, value) => native.create(songs.doc(songId).collection('permissionAudit').doc(), value),
    })),
  };
};

module.exports = { createFirestoreSongDuplicationRepository, operationDocumentId, resolveCreatePermission };
