/* global require, module */

const PERMISSION_CATALOG = new Set([
  'dashboard.view', 'events.view', 'events.create', 'events.edit', 'events.delete',
  'setlists.view', 'setlists.addSong', 'setlists.removeSong', 'setlists.reorder', 'setlists.control', 'setlists.manage',
  'songs.view', 'songs.create', 'songs.editLyrics', 'songs.editChords', 'songs.editMetadata', 'songs.manageMedia', 'songs.archive', 'songs.delete',
  'rehearsal.access', 'rehearsal.control', 'bible.view', 'bible.project', 'bible.quickProjection',
  'sermons.view', 'sermons.create', 'sermons.edit', 'sermons.createPoint', 'sermons.createBiblePassage', 'sermons.delete', 'sermons.project',
  'multimedia.libraryView', 'multimedia.upload', 'multimedia.edit', 'multimedia.delete', 'multimedia.centralAccess', 'multimedia.controlOutputs', 'multimedia.project',
  'canva.view', 'canva.create', 'canva.edit', 'canva.delete', 'canva.project',
  'announcements.view', 'announcements.create', 'announcements.edit', 'announcements.delete', 'announcements.project',
  'team.view', 'team.edit', 'team.manageRoles', 'team.managePermissions',
  'devotionals.view', 'devotionals.manage', 'devotionals.confirm', 'profile.editOwn'
]);

const MANAGEABLE_ROLE_KEYS = new Set(['admin', 'multimedia', 'musico', 'cantante', 'pastor', 'predicador']);

const normalizeRoleKey = (role) => String(role || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim();

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

module.exports = ({ functions, admin }) => {
  const httpsError = (code, message) => new functions.https.HttpsError(code, message);

  const assertAuthenticated = (context) => {
    if (!context.auth?.uid) throw httpsError('unauthenticated', 'Debes iniciar sesion.');
    return context.auth.uid;
  };

  const assertExactPayload = (data, expectedKeys) => {
    if (!isPlainObject(data)) throw httpsError('invalid-argument', 'Payload inválido.');
    const keys = Object.keys(data);
    if (keys.length !== expectedKeys.length || keys.some((key) => !expectedKeys.includes(key))) {
      throw httpsError('invalid-argument', 'Payload inválido.');
    }
  };

  const assertNonEmptyString = (value, field) => {
    if (typeof value !== 'string' || !value.trim()) throw httpsError('invalid-argument', `${field} es obligatorio.`);
    return value.trim();
  };

  const assertPermissionMap = (value, field) => {
    if (!isPlainObject(value) || Object.keys(value).length > PERMISSION_CATALOG.size
      || Object.entries(value).some(([permission, enabled]) => !PERMISSION_CATALOG.has(permission) || typeof enabled !== 'boolean')) {
      throw httpsError('invalid-argument', `${field} invalido.`);
    }
    return value;
  };

  const assertPermissionChanges = (value) => {
    if (!isPlainObject(value) || !Object.keys(value).length || Object.keys(value).length > PERMISSION_CATALOG.size
      || Object.entries(value).some(([permission, enabled]) => !PERMISSION_CATALOG.has(permission) || (enabled !== null && typeof enabled !== 'boolean'))) {
      throw httpsError('invalid-argument', 'Cambios de permisos invalidos.');
    }
    return value;
  };

  const assertBulkTargetUids = (value) => {
    if (!Array.isArray(value) || !value.length || value.length > 50
      || value.some((uid) => typeof uid !== 'string' || !uid.trim() || uid.length > 256)
      || new Set(value).size !== value.length) {
      throw httpsError('invalid-argument', 'Lista de integrantes invalida.');
    }
    return value.map((uid) => uid.trim());
  };

  const requireOwner = async (uid) => {
    const userSnap = await admin.firestore().collection('usuarios').doc(uid).get();
    if (!userSnap.exists || normalizeRoleKey(userSnap.get('rol') || userSnap.get('role')) !== 'dueno') {
      throw httpsError('permission-denied', 'Solo el dueño puede gestionar permisos.');
    }
    return { uid };
  };

  const updateUserPermissionOverrides = functions.https.onCall(async (data, context) => {
    const actorUid = assertAuthenticated(context);
    assertExactPayload(data, ['targetUid', 'permissionOverrides']);
    const targetUid = assertNonEmptyString(data.targetUid, 'targetUid');
    const permissionOverrides = assertPermissionMap(data.permissionOverrides, 'permissionOverrides');
    const actor = await requireOwner(actorUid);
    const db = admin.firestore();
    const targetRef = db.collection('usuarios').doc(targetUid);
    const auditRef = targetRef.collection('permissionAudit').doc();

    await db.runTransaction(async (transaction) => {
      const targetSnap = await transaction.get(targetRef);
      if (!targetSnap.exists) throw httpsError('not-found', 'Usuario no encontrado.');
      if (normalizeRoleKey(targetSnap.get('rol') || targetSnap.get('role')) === 'dueno') {
        throw httpsError('failed-precondition', 'El dueño no admite excepciones de permisos.');
      }
      transaction.update(targetRef, { permissionOverrides });
      transaction.set(auditRef, {
        actorUid: actor.uid,
        targetUid,
        oldValue: targetSnap.get('permissionOverrides') || {},
        newValue: permissionOverrides,
        action: 'overrides',
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
    });
    return { ok: true };
  });

  const bulkUpdateUserPermissionOverrides = functions.https.onCall(async (data, context) => {
    const actorUid = assertAuthenticated(context);
    assertExactPayload(data, ['userIds', 'changes']);
    const userIds = assertBulkTargetUids(data.userIds);
    const changes = assertPermissionChanges(data.changes);
    const actor = await requireOwner(actorUid);
    const db = admin.firestore();

    await db.runTransaction(async (transaction) => {
      const refs = userIds.map((uid) => db.collection('usuarios').doc(uid));
      const snapshots = [];
      for (const ref of refs) snapshots.push(await transaction.get(ref));

      snapshots.forEach((snapshot, index) => {
        if (!snapshot.exists) throw httpsError('not-found', `Usuario no encontrado: ${userIds[index]}`);
        if (normalizeRoleKey(snapshot.get('rol') || snapshot.get('role')) === 'dueno') {
          throw httpsError('failed-precondition', 'El dueño no admite excepciones de permisos.');
        }
      });

      snapshots.forEach((snapshot, index) => {
        const targetRef = refs[index];
        const previousOverrides = isPlainObject(snapshot.get('permissionOverrides')) ? snapshot.get('permissionOverrides') : {};
        const nextOverrides = { ...previousOverrides };
        Object.entries(changes).forEach(([permission, value]) => {
          if (value === null) delete nextOverrides[permission];
          else nextOverrides[permission] = value;
        });
        transaction.update(targetRef, { permissionOverrides: nextOverrides });
        transaction.set(targetRef.collection('permissionAudit').doc(), {
          actorUid: actor.uid,
          targetUid: targetRef.id,
          oldValue: previousOverrides,
          newValue: nextOverrides,
          changes,
          action: 'bulk-overrides',
          timestamp: admin.firestore.FieldValue.serverTimestamp()
        });
      });
    });

    return { ok: true, updated: userIds.length };
  });

  const updateRolePermissionDefaults = functions.https.onCall(async (data, context) => {
    const actorUid = assertAuthenticated(context);
    assertExactPayload(data, ['role', 'roleDefaults']);
    const role = normalizeRoleKey(assertNonEmptyString(data.role, 'role'));
    if (!MANAGEABLE_ROLE_KEYS.has(role)) throw httpsError('invalid-argument', 'Rol no administrable.');
    const roleDefaults = assertPermissionMap(data.roleDefaults, 'roleDefaults');
    const actor = await requireOwner(actorUid);
    const db = admin.firestore();
    const configRef = db.collection('sistema').doc('permissionRoles');
    const auditRef = configRef.collection('audit').doc();

    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(configRef);
      const currentDefaults = snapshot.exists && isPlainObject(snapshot.get('roleDefaults')) ? snapshot.get('roleDefaults') : {};
      const nextDefaults = { ...currentDefaults, [role]: roleDefaults };
      transaction.set(configRef, {
        version: 1,
        roleDefaults: nextDefaults,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: actor.uid
      }, { merge: true });
      transaction.set(auditRef, {
        actorUid: actor.uid,
        role,
        oldValue: currentDefaults[role] || {},
        newValue: roleDefaults,
        action: 'role-defaults',
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
    });

    return { ok: true };
  });

  return {
    updateRolePermissionDefaults,
    updateUserPermissionOverrides,
    bulkUpdateUserPermissionOverrides
  };
};
