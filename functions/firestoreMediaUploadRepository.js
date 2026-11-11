/* global module */

const COLLECTIONS = Object.freeze({
  operations: 'mediaUploadOperations',
  resources: 'mediaUploadResources',
  audit: 'mediaUploadAudit',
});

const normalizeRole = role => String(role || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim();

const resolveUploadPermission = (user = {}, roleDefaults = {}) => {
  const role = normalizeRole(user.rol || user.role);
  if (role === 'dueno') return true;
  const override = user.permissionOverrides?.['multimedia.upload'];
  if (typeof override === 'boolean') return override;
  const configured = roleDefaults?.[role]?.['multimedia.upload'];
  if (typeof configured === 'boolean') return configured;
  return role === 'admin' || role === 'multimedia';
};

const assertFirestore = (firestore) => {
  if (!firestore || typeof firestore.runTransaction !== 'function' || typeof firestore.collection !== 'function') {
    throw new Error('firestore_media_upload_repository_requires_firestore');
  }
};

const createFirestoreMediaUploadRepository = ({ firestore }) => {
  assertFirestore(firestore);
  const operations = firestore.collection(COLLECTIONS.operations);
  const resources = firestore.collection(COLLECTIONS.resources);
  const audit = firestore.collection(COLLECTIONS.audit);

  return {
    runTransaction: callback => firestore.runTransaction(async transaction => {
      const adapter = {
        getActorAuthorization: async uid => {
          const [userSnapshot, permissionSnapshot] = await transaction.getAll(
            firestore.collection('usuarios').doc(uid),
            firestore.collection('sistema').doc('permissionRoles'),
          );
          if (!userSnapshot.exists) return null;
          const user = userSnapshot.data() || {};
          const roleDefaults = permissionSnapshot.exists
            ? permissionSnapshot.get('roleDefaults') || {}
            : {};
          return {
            accountStatus: user.accountStatus,
            permissions: resolveUploadPermission(user, roleDefaults) ? ['multimedia.upload'] : [],
          };
        },
        getOperation: async operationId => {
          const snapshot = await transaction.get(operations.doc(operationId));
          return snapshot.exists ? snapshot.data() : undefined;
        },
        setOperation: async (operationId, value) => {
          transaction.set(operations.doc(operationId), value);
        },
        createResource: async (resourceId, value) => {
          transaction.create(resources.doc(resourceId), value);
        },
        appendAudit: async value => {
          transaction.create(audit.doc(), value);
        },
      };
      return callback(adapter);
    }),
  };
};

module.exports = {
  COLLECTIONS,
  createFirestoreMediaUploadRepository,
  resolveUploadPermission,
};
