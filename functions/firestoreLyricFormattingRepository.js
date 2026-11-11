/* global module, require */
const { createHash } = require('crypto');

const operationId = (songId, requestId) => createHash('sha256')
  .update(`${songId}:${requestId}`, 'utf8')
  .digest('hex');

const normalizeRole = role => String(role || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const resolvePermission = (user = {}, roleDefaults = {}) => {
  const role = normalizeRole(user.rol);
  if (role === 'dueno') return true;
  const override = user.permissionOverrides?.['songs.editLyrics'];
  if (typeof override === 'boolean') return override;
  const configured = roleDefaults?.[role]?.['songs.editLyrics'];
  if (typeof configured === 'boolean') return configured;
  return ['admin', 'multimedia'].includes(role);
};

const createFirestoreLyricFormattingRepository = firestore => {
  if (!firestore?.runTransaction || !firestore?.collection) throw new Error('firestore_required');
  const songs = firestore.collection('canciones');
  const users = firestore.collection('usuarios');
  const permissions = firestore.collection('sistema').doc('permissionRoles');
  const operations = firestore.collection('lyricFormattingOperations');
  return {
    runTransaction: callback => firestore.runTransaction(async native => callback({
      getActorAuthorization: async uid => {
        const [userSnap, permissionSnap] = await Promise.all([native.get(users.doc(uid)), native.get(permissions)]);
        if (!userSnap.exists) return null;
        const user = userSnap.data() || {};
        const defaults = permissionSnap.exists ? permissionSnap.get('roleDefaults') || {} : {};
        return { accountStatus: user.accountStatus, permissions: resolvePermission(user, defaults) ? ['songs.editLyrics'] : [] };
      },
      getSong: async songId => {
        const snapshot = await native.get(songs.doc(songId));
        return snapshot.exists ? { id: snapshot.id, ...snapshot.data() } : null;
      },
      getOperation: async (_uid, songId, requestId) => {
        const snapshot = await native.get(operations.doc(operationId(songId, requestId)));
        return snapshot.exists ? snapshot.data() : null;
      },
      updateSong: async (songId, patch) => native.update(songs.doc(songId), patch),
      createOperation: async (_uid, songId, requestId, value) => native.create(operations.doc(operationId(songId, requestId)), value),
      appendAudit: async (songId, value) => native.create(songs.doc(songId).collection('permissionAudit').doc(), value),
    })),
  };
};

module.exports = { createFirestoreLyricFormattingRepository, operationId, resolvePermission };
