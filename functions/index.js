const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const { randomUUID } = require("crypto");
const {
  canEditChordsOnly,
  canEditLyricsOnly
} = require("./songContent");
const { validateQuickMessagePayload } = require("./quickMessagePayload");

admin.initializeApp();

const LIVE_SETLIST_ROLES = new Set(["due\u00f1o", "dueno", "admin", "multimedia"]);
const LIVE_SETLIST_PERMISSIONS = new Set([
  "setlists.addSong",
  "setlists.removeSong",
  "setlists.reorder",
  "setlists.manage"
]);
const SONG_METADATA_FIELDS = new Set([
  "titulo", "artista", "tonoOriginal", "tonosAlternativos", "etiquetas", "bpm", "youtubeUrl"
]);
const SONG_MEDIA_FIELDS = new Set([
  "recursos", "multitracks", "sectionMedia", "audioUrl", "fondoUrl", "fondoMediaId"
]);
const PERMISSION_CATALOG = new Set([
  "dashboard.view", "events.view", "events.create", "events.edit", "events.delete",
  "setlists.view", "setlists.addSong", "setlists.removeSong", "setlists.reorder", "setlists.control", "setlists.manage",
  "songs.view", "songs.create", "songs.editLyrics", "songs.editChords", "songs.editMetadata", "songs.manageMedia", "songs.archive", "songs.delete",
  "rehearsal.access", "rehearsal.control", "bible.view", "bible.project", "bible.quickProjection",
  "sermons.view", "sermons.create", "sermons.edit", "sermons.delete", "sermons.project",
  "multimedia.libraryView", "multimedia.upload", "multimedia.edit", "multimedia.delete", "multimedia.centralAccess", "multimedia.controlOutputs", "multimedia.project",
  "announcements.view", "announcements.create", "announcements.edit", "announcements.delete", "announcements.project",
  "team.view", "team.edit", "team.manageRoles", "team.managePermissions",
  "devotionals.view", "devotionals.manage", "devotionals.confirm", "profile.editOwn"
]);
const MANAGEABLE_ROLE_KEYS = new Set(["admin", "multimedia", "musico", "cantante", "pastor", "predicador"]);
const LEGACY_ROLE_PERMISSIONS = Object.freeze({
  admin: new Set(["songs.editLyrics", "songs.editChords", "songs.editMetadata", "songs.manageMedia", "songs.archive", "setlists.addSong", "setlists.removeSong", "setlists.reorder", "setlists.manage"]),
  multimedia: new Set(["songs.editLyrics", "songs.editChords", "songs.editMetadata", "songs.manageMedia", "songs.archive", "setlists.addSong", "setlists.removeSong", "setlists.reorder", "setlists.manage"])
});

const normalizeRoleKey = (role) => String(role || "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .trim();

const hasLiveSetlistPermission = (user = {}, roleDefaults = {}, permission) => {
  const role = normalizeRoleKey(user.rol);
  if (role === "dueno") return true;
  const overrides = isPlainObject(user.permissionOverrides) ? user.permissionOverrides : {};
  const defaults = isPlainObject(roleDefaults?.[role]) ? roleDefaults[role] : null;

  if (!LIVE_SETLIST_PERMISSIONS.has(permission)) return false;
  if (typeof overrides[permission] === "boolean") return overrides[permission];
  if (defaults && typeof defaults[permission] === "boolean") return defaults[permission];
  return LIVE_SETLIST_ROLES.has(role);
};

const isPlainObject = (value) => (
  value !== null && typeof value === "object" && !Array.isArray(value)
);

const assertExactPayload = (data, expectedKeys) => {
  if (!isPlainObject(data)) {
    throw new functions.https.HttpsError("invalid-argument", "Payload inv\u00e1lido.");
  }

  const keys = Object.keys(data);
  if (keys.length !== expectedKeys.length || keys.some((key) => !expectedKeys.includes(key))) {
    throw new functions.https.HttpsError("invalid-argument", "Payload inv\u00e1lido.");
  }
};

const assertNonEmptyString = (value, field) => {
  if (typeof value !== "string" || !value.trim()) {
    throw new functions.https.HttpsError("invalid-argument", `${field} es obligatorio.`);
  }
  return value.trim();
};

const assertLiveSetlistAccess = async (uid, permission) => {
  const db = admin.firestore();
  const [userSnap, permissionSnap] = await Promise.all([
    db.collection("usuarios").doc(uid).get(),
    db.collection("sistema").doc("permissionRoles").get()
  ]);
  const user = userSnap.exists ? userSnap.data() || {} : {};
  const role = user.rol || null;
  const roleDefaults = permissionSnap.exists ? permissionSnap.get("roleDefaults") || {} : {};

  if (!hasLiveSetlistPermission(user, roleDefaults, permission)) {
    throw new functions.https.HttpsError("permission-denied", "No tienes permisos para gestionar el setlist en vivo.");
  }

  return { uid, role, user };
};

const hasPermission = (user = {}, roleDefaults = {}, permission) => {
  const role = normalizeRoleKey(user.rol);
  if (role === "dueno") return true;
  const overrides = isPlainObject(user.permissionOverrides) ? user.permissionOverrides : {};
  const defaults = isPlainObject(roleDefaults?.[role]) ? roleDefaults[role] : null;
  if (typeof overrides[permission] === "boolean") return overrides[permission];
  if (defaults && typeof defaults[permission] === "boolean") return defaults[permission];
  return LEGACY_ROLE_PERMISSIONS[role]?.has(permission) === true;
};

const loadActor = async (uid) => {
  const db = admin.firestore();
  const [userSnap, permissionSnap] = await Promise.all([
    db.collection("usuarios").doc(uid).get(),
    db.collection("sistema").doc("permissionRoles").get()
  ]);
  const user = userSnap.exists ? userSnap.data() || {} : {};
  return {
    uid,
    user,
    role: normalizeRoleKey(user.rol),
    roleDefaults: permissionSnap.exists ? permissionSnap.get("roleDefaults") || {} : {}
  };
};

const requirePermission = async (uid, permission) => {
  const actor = await loadActor(uid);
  if (!hasPermission(actor.user, actor.roleDefaults, permission)) {
    throw new functions.https.HttpsError("permission-denied", "No tienes permiso para esta operacion.");
  }
  return actor;
};

const assertSongPayload = (data, expectedKeys) => {
  assertExactPayload(data, expectedKeys);
  const songId = assertNonEmptyString(data.songId, "songId");
  if (songId.length > 256) {
    throw new functions.https.HttpsError("invalid-argument", "songId invalido.");
  }
  return songId;
};

const assertSongText = (value) => {
  if (typeof value !== "string" || value.length > 100000) {
    throw new functions.https.HttpsError("invalid-argument", "Contenido de cancion invalido.");
  }
  return value;
};

const assertQuickMessageHistoryEntryId = (value, { optional = false } = {}) => {
  if (optional && (value === undefined || value === null || value === "")) return null;
  if (typeof value !== "string" || !value.trim() || value.length > 200) {
    throw new functions.https.HttpsError("invalid-argument", "Identificador de historial invalido.");
  }
  return value.trim();
};

const assertQuickMessagePayload = (data) => {
  const payload = isPlainObject(data) ? { ...data } : data;
  const historyEntryId = isPlainObject(payload) && Object.prototype.hasOwnProperty.call(payload, "historyEntryId")
    ? assertQuickMessageHistoryEntryId(payload.historyEntryId, { optional: true })
    : null;
  if (isPlainObject(payload)) delete payload.historyEntryId;

  try {
    return { ...validateQuickMessagePayload(payload), historyEntryId };
  } catch (error) {
    throw new functions.https.HttpsError("invalid-argument", error.message);
  }
};

const QUICK_MESSAGE_HISTORY_LIMIT = 8;

const appendQuickMessageHistory = (history, message, now, preferredId = null) => {
  const entry = {
    id: preferredId || `quick-${now}-${randomUUID()}`,
    presentationType: message.presentationType,
    segments: message.segments,
    content: message.content,
    updatedAt: now
  };
  const existing = Array.isArray(history) ? history : [];
  const nextHistory = [
    entry,
    ...existing.filter((item) => item?.id !== entry.id && item?.content !== entry.content)
  ].slice(0, QUICK_MESSAGE_HISTORY_LIMIT);
  return { entry, history: nextHistory };
};

const QUICK_MESSAGE_RESTORABLE_FIELDS = [
  "proyectorSlide", "proyectorMedia", "proyectorLogo", "proyectorApagado", "proyectorFondo", "proyectorFondoMedia",
  "proyectorSongId", "proyectorSlideIndex", "proyectorNextSlide", "proyectorNextSong", "proyectorOffset", "liveState", "currentSongId"
];

const cloneProjectionValue = (value) => value == null ? value : JSON.parse(JSON.stringify(value));

const captureQuickMessagePreviousProjection = (eventData = {}) => {
  const currentState = eventData.projectorState;
  const projectorState = isPlainObject(currentState) ? cloneProjectionValue(currentState) : null;
  const snapshot = { projectorState };
  QUICK_MESSAGE_RESTORABLE_FIELDS.forEach((field) => {
    snapshot[field] = Object.prototype.hasOwnProperty.call(eventData, field) ? cloneProjectionValue(eventData[field]) : null;
  });
  return snapshot;
};

const hasRestorableQuickMessageSnapshot = (snapshot) => isPlainObject(snapshot)
  && isPlainObject(snapshot.projectorState) && isPlainObject(snapshot.liveState);

const buildInactiveAnnouncementState = (updatedAt) => ({
  announcementId: "", currentSlideIndex: 0, currentSlide: null, totalSlides: 0, presentationActive: false,
  transition: { type: "fade", durationMs: 500 }, autoAdvance: { enabled: false, durationMs: 7000 }, updatedAt
});

const assertMetadataChanges = (changes) => {
  if (!isPlainObject(changes)) {
    throw new functions.https.HttpsError("invalid-argument", "Cambios de metadata invalidos.");
  }
  const keys = Object.keys(changes);
  if (!keys.length || keys.some((key) => !SONG_METADATA_FIELDS.has(key) && !SONG_MEDIA_FIELDS.has(key))) {
    throw new functions.https.HttpsError("invalid-argument", "Campo de cancion no permitido.");
  }
  if (keys.some((key) => key === "letraRaw" || key === "estado" || key === "archived")) {
    throw new functions.https.HttpsError("invalid-argument", "Campo de cancion no permitido.");
  }
  if (JSON.stringify(changes).length > 500000) {
    throw new functions.https.HttpsError("invalid-argument", "Cambios demasiado grandes.");
  }
  keys.forEach((key) => {
    const value = changes[key];
    const textField = ["titulo", "artista", "tonoOriginal", "tonosAlternativos", "youtubeUrl", "audioUrl", "fondoUrl", "fondoMediaId"].includes(key);
    if (textField && value !== null && (typeof value !== "string" || value.length > 5000)) {
      throw new functions.https.HttpsError("invalid-argument", "Valor de metadata invalido.");
    }
    if (key === "bpm" && (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1000)) {
      throw new functions.https.HttpsError("invalid-argument", "BPM invalido.");
    }
    if (key === "etiquetas" && (!Array.isArray(value) || value.length > 50 || value.some((tag) => typeof tag !== "string" || tag.length > 100))) {
      throw new functions.https.HttpsError("invalid-argument", "Etiquetas invalidas.");
    }
    if (["recursos", "multitracks"].includes(key) && (!Array.isArray(value) || value.length > 200)) {
      throw new functions.https.HttpsError("invalid-argument", "Recursos invalidos.");
    }
    if (key === "recursos") value.forEach((resource) => assertSongResource(resource, ["id", "titulo", "tipo", "url", "instrumento"]));
    if (key === "multitracks") value.forEach((track) => assertSongResource(track, ["id", "nombre", "url", "fileName"]));
    if (key === "sectionMedia" && !isPlainObject(value)) {
      throw new functions.https.HttpsError("invalid-argument", "Media por seccion invalida.");
    }
    if (key === "sectionMedia") {
      const sectionKeys = Object.keys(value);
      if (sectionKeys.length > 100 || sectionKeys.some((section) => typeof section !== "string" || section.length > 300)) {
        throw new functions.https.HttpsError("invalid-argument", "Secciones multimedia invalidas.");
      }
      sectionKeys.forEach((section) => {
        const resources = value[section];
        if (!Array.isArray(resources) || resources.length > 50) {
          throw new functions.https.HttpsError("invalid-argument", "Media por seccion invalida.");
        }
        resources.forEach((resource) => assertSongResource(resource, ["id", "mediaId", "title", "name", "type", "url", "thumbnailUrl", "provider", "source", "usageCount", "usedBy", "sectionTitle", "pendingLibraryResource"]));
      });
    }
  });
  return keys;
};

const assertSongResource = (resource, allowedKeys) => {
  if (!isPlainObject(resource) || Object.keys(resource).some((key) => !allowedKeys.includes(key))) {
    throw new functions.https.HttpsError("invalid-argument", "Recurso de cancion invalido.");
  }
  Object.entries(resource).forEach(([key, value]) => {
    if (["usageCount"].includes(key)) {
      if (!Number.isInteger(value) || value < 0 || value > 100000) throw new functions.https.HttpsError("invalid-argument", "Recurso de cancion invalido.");
      return;
    }
    if (key === "usedBy") {
      if (!Array.isArray(value) || value.length > 500 || value.some((item) => !isPlainObject(item))) throw new functions.https.HttpsError("invalid-argument", "Recurso de cancion invalido.");
      return;
    }
    if (key === "pendingLibraryResource") {
      if (!isPlainObject(value) || JSON.stringify(value).length > 10000) throw new functions.https.HttpsError("invalid-argument", "Recurso de cancion invalido.");
      return;
    }
    if (typeof value !== "string" || value.length > 5000) throw new functions.https.HttpsError("invalid-argument", "Recurso de cancion invalido.");
  });
};

const songAuditData = (actor, action, fields) => ({
  actorUid: actor.uid,
  actorRole: actor.role,
  action,
  fields,
  timestamp: admin.firestore.FieldValue.serverTimestamp()
});

const readActorInTransaction = async (transaction, uid) => {
  const db = admin.firestore();
  const [userSnap, permissionSnap] = await Promise.all([
    transaction.get(db.collection("usuarios").doc(uid)),
    transaction.get(db.collection("sistema").doc("permissionRoles"))
  ]);
  const user = userSnap.exists ? userSnap.data() || {} : {};
  return {
    uid,
    user,
    role: normalizeRoleKey(user.rol),
    roleDefaults: permissionSnap.exists ? permissionSnap.get("roleDefaults") || {} : {}
  };
};

const requireOwner = async (uid) => {
  const actor = await loadActor(uid);
  if (actor.role !== "dueno") {
    throw new functions.https.HttpsError("permission-denied", "Solo el dueño puede gestionar permisos.");
  }
  return actor;
};

const assertPermissionMap = (value, field) => {
  if (!isPlainObject(value) || Object.keys(value).length > PERMISSION_CATALOG.size
    || Object.entries(value).some(([permission, enabled]) => !PERMISSION_CATALOG.has(permission) || typeof enabled !== "boolean")) {
    throw new functions.https.HttpsError("invalid-argument", `${field} invalido.`);
  }
  return value;
};

const assertPermissionChanges = (value) => {
  if (!isPlainObject(value) || !Object.keys(value).length || Object.keys(value).length > PERMISSION_CATALOG.size
    || Object.entries(value).some(([permission, enabled]) => !PERMISSION_CATALOG.has(permission) || (enabled !== null && typeof enabled !== "boolean"))) {
    throw new functions.https.HttpsError("invalid-argument", "Cambios de permisos invalidos.");
  }
  return value;
};

const assertBulkTargetUids = (value) => {
  if (!Array.isArray(value) || !value.length || value.length > 50
    || value.some((uid) => typeof uid !== "string" || !uid.trim() || uid.length > 256)
    || new Set(value).size !== value.length) {
    throw new functions.https.HttpsError("invalid-argument", "Lista de integrantes invalida.");
  }
  return value;
};

exports.updateUserPermissionOverrides = functions.https.onCall(async (data, context) => {
  if (!context.auth?.uid) throw new functions.https.HttpsError("unauthenticated", "Debes iniciar sesion.");
  assertExactPayload(data, ["targetUid", "permissionOverrides"]);
  const targetUid = assertNonEmptyString(data.targetUid, "targetUid");
  const permissionOverrides = assertPermissionMap(data.permissionOverrides, "permissionOverrides");
  const actor = await requireOwner(context.auth.uid);
  const db = admin.firestore();
  const targetRef = db.collection("usuarios").doc(targetUid);
  const auditRef = targetRef.collection("permissionAudit").doc();

  await db.runTransaction(async (transaction) => {
    const targetSnap = await transaction.get(targetRef);
    if (!targetSnap.exists) throw new functions.https.HttpsError("not-found", "Usuario no encontrado.");
    if (normalizeRoleKey(targetSnap.get("rol")) === "dueno") {
      throw new functions.https.HttpsError("failed-precondition", "El dueño no admite excepciones de permisos.");
    }
    transaction.update(targetRef, { permissionOverrides });
    transaction.set(auditRef, {
      actorUid: actor.uid, targetUid, oldValue: targetSnap.get("permissionOverrides") || {},
      newValue: permissionOverrides, action: "overrides",
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
  });
  return { ok: true };
});

exports.bulkUpdateUserPermissionOverrides = functions.https.onCall(async (data, context) => {
  if (!context.auth?.uid) throw new functions.https.HttpsError("unauthenticated", "Debes iniciar sesion.");
  assertExactPayload(data, ["userIds", "changes"]);
  const userIds = assertBulkTargetUids(data.userIds);
  const changes = assertPermissionChanges(data.changes);
  const actor = await requireOwner(context.auth.uid);
  const db = admin.firestore();

  await db.runTransaction(async (transaction) => {
    const targetRefs = userIds.map((uid) => db.collection("usuarios").doc(uid));
    const targetSnaps = await Promise.all(targetRefs.map((ref) => transaction.get(ref)));

    targetSnaps.forEach((targetSnap) => {
      if (!targetSnap.exists) throw new functions.https.HttpsError("not-found", "Usuario no encontrado.");
      if (normalizeRoleKey(targetSnap.get("rol")) === "dueno") {
        throw new functions.https.HttpsError("failed-precondition", "El dueno no admite cambios masivos de permisos.");
      }
    });

    targetSnaps.forEach((targetSnap, index) => {
      const targetRef = targetRefs[index];
      const previousOverrides = isPlainObject(targetSnap.get("permissionOverrides")) ? targetSnap.get("permissionOverrides") : {};
      const nextOverrides = { ...previousOverrides };
      Object.entries(changes).forEach(([permission, value]) => {
        if (value === null) delete nextOverrides[permission]; else nextOverrides[permission] = value;
      });
      transaction.update(targetRef, { permissionOverrides: nextOverrides });
      transaction.set(targetRef.collection("permissionAudit").doc(), {
        actorUid: actor.uid,
        targetUid: targetRef.id,
        oldValue: previousOverrides,
        newValue: nextOverrides,
        changes,
        action: "bulk-overrides",
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
    });
  });
  return { ok: true, updated: userIds.length };
});

exports.updateRolePermissionDefaults = functions.https.onCall(async (data, context) => {
  if (!context.auth?.uid) throw new functions.https.HttpsError("unauthenticated", "Debes iniciar sesion.");
  assertExactPayload(data, ["role", "roleDefaults"]);
  const role = normalizeRoleKey(assertNonEmptyString(data.role, "role"));
  if (!MANAGEABLE_ROLE_KEYS.has(role)) throw new functions.https.HttpsError("invalid-argument", "Rol no administrable.");
  const roleDefaults = assertPermissionMap(data.roleDefaults, "roleDefaults");
  const actor = await requireOwner(context.auth.uid);
  const db = admin.firestore();
  const configRef = db.collection("sistema").doc("permissionRoles");
  const auditRef = configRef.collection("audit").doc();

  await db.runTransaction(async (transaction) => {
    const configSnap = await transaction.get(configRef);
    const currentDefaults = configSnap.exists ? configSnap.get("roleDefaults") || {} : {};
    const nextDefaults = { ...currentDefaults, [role]: roleDefaults };
    transaction.set(configRef, {
      version: 1, roleDefaults: nextDefaults, updatedAt: admin.firestore.FieldValue.serverTimestamp(), updatedBy: actor.uid
    }, { merge: true });
    transaction.set(auditRef, {
      actorUid: actor.uid, role, oldValue: currentDefaults[role] || {}, newValue: roleDefaults,
      action: "role-defaults", timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
  });
  return { ok: true };
});

exports.updateSongChords = functions.https.onCall(async (data, context) => {
  if (!context.auth?.uid) throw new functions.https.HttpsError("unauthenticated", "Debes iniciar sesion.");
  const songId = assertSongPayload(data, ["songId", "letraRaw"]);
  const letraRaw = assertSongText(data.letraRaw);
  const db = admin.firestore();
  const ref = db.collection("canciones").doc(songId);
  await db.runTransaction(async (transaction) => {
    const [actor, songSnap] = await Promise.all([readActorInTransaction(transaction, context.auth.uid), transaction.get(ref)]);
    if (!hasPermission(actor.user, actor.roleDefaults, "songs.editChords")) throw new functions.https.HttpsError("permission-denied", "No tienes permiso para esta operacion.");
    if (!songSnap.exists) throw new functions.https.HttpsError("not-found", "La cancion no existe.");
    if (!canEditChordsOnly(songSnap.get("letraRaw") || "", letraRaw)) throw new functions.https.HttpsError("permission-denied", "La edicion de acordes no puede cambiar letra o estructura.");
    transaction.update(ref, { letraRaw, fechaActualizacion: new Date().toISOString() });
    transaction.set(ref.collection("permissionAudit").doc(), songAuditData(actor, "songs.editChords", ["letraRaw"]));
  });
  return { ok: true };
});

exports.updateSongLyrics = functions.https.onCall(async (data, context) => {
  if (!context.auth?.uid) throw new functions.https.HttpsError("unauthenticated", "Debes iniciar sesion.");
  const songId = assertSongPayload(data, ["songId", "letraRaw"]);
  const letraRaw = assertSongText(data.letraRaw);
  const db = admin.firestore(); const ref = db.collection("canciones").doc(songId);
  await db.runTransaction(async (transaction) => {
    const [actor, songSnap] = await Promise.all([readActorInTransaction(transaction, context.auth.uid), transaction.get(ref)]);
    if (!hasPermission(actor.user, actor.roleDefaults, "songs.editLyrics")) throw new functions.https.HttpsError("permission-denied", "No tienes permiso para esta operacion.");
    if (!songSnap.exists) throw new functions.https.HttpsError("not-found", "La cancion no existe.");
    if (!canEditLyricsOnly(songSnap.get("letraRaw") || "", letraRaw)) throw new functions.https.HttpsError("permission-denied", "La edicion de letra no puede cambiar acordes o estructura.");
    transaction.update(ref, { letraRaw, fechaActualizacion: new Date().toISOString() });
    transaction.set(ref.collection("permissionAudit").doc(), songAuditData(actor, "songs.editLyrics", ["letraRaw"]));
  });
  return { ok: true };
});

exports.projectQuickMessage = functions.https.onCall(async (data, context) => {
  if (!context.auth?.uid) throw new functions.https.HttpsError("unauthenticated", "Debes iniciar sesion.");
  const message = assertQuickMessagePayload(data);
  const db = admin.firestore();
  const eventRef = db.collection("eventos").doc(message.eventoId);
  return db.runTransaction(async (transaction) => {
    const [actor, eventSnap] = await Promise.all([readActorInTransaction(transaction, context.auth.uid), transaction.get(eventRef)]);
    if (!hasPermission(actor.user, actor.roleDefaults, "bible.quickProjection")) {
      throw new functions.https.HttpsError("permission-denied", "No tienes permiso para proyectar puntos del mensaje.");
    }
    if (!eventSnap.exists) throw new functions.https.HttpsError("not-found", "El evento ya no esta disponible.");
    const now = Date.now();
    const projectionActionId = `quick-${now}-${randomUUID()}`;
    const previousProjectionFields = captureQuickMessagePreviousProjection(eventSnap.data() || {});
    const actorName = actor.user.nombre || actor.user.email || "Multimedia";
    const quickMessageHistory = appendQuickMessageHistory(
      eventSnap.get("quickMessageHistory"),
      message,
      now,
      message.historyEntryId
    );
    transaction.update(eventRef, {
      announcementState: buildInactiveAnnouncementState(now),
      projectorState: {
        type: "preaching", contentType: "quickMessage", preachingType: "quickMessage",
        presentationType: message.presentationType, title: message.content.slice(0, 120), content: message.content,
        segments: message.segments, alignment: "center", media: null, background: null, backgroundMedia: null,
        previousProjectorState: null, previousProjectionFields, sourceActor: "multimedia", actorUid: actor.uid,
        actorName, actorRole: actor.role || "", updatedBy: actorName, updatedAt: now,
        projectionVersion: now, projectionActionId
      },
      proyectorSlide: null, proyectorMedia: null, proyectorLogo: false, proyectorApagado: false,
      proyectorFondo: null, proyectorFondoMedia: null, proyectorSongId: null, proyectorSlideIndex: -1,
      proyectorNextSlide: null, proyectorNextSong: null,
      liveState: { activeContentType: "quickMessage", contentTitle: message.content.slice(0, 120), updatedBy: actorName, updatedAt: now },
      currentSongId: null,
      quickMessageHistory: quickMessageHistory.history
    });
    return {
      ok: true,
      projectionActionId,
      historyEntry: quickMessageHistory.entry,
      history: quickMessageHistory.history
    };
  });
});

exports.clearQuickMessageProjection = functions.https.onCall(async (data, context) => {
  if (!context.auth?.uid) throw new functions.https.HttpsError("unauthenticated", "Debes iniciar sesion.");
  assertExactPayload(data, ["eventoId", "projectionActionId"]);
  const eventoId = assertNonEmptyString(data.eventoId, "eventoId");
  const projectionActionId = assertNonEmptyString(data.projectionActionId, "projectionActionId");
  if (eventoId.length > 256 || projectionActionId.length > 200) throw new functions.https.HttpsError("invalid-argument", "Solicitud invalida.");
  const db = admin.firestore();
  const eventRef = db.collection("eventos").doc(eventoId);
  return db.runTransaction(async (transaction) => {
    const [actor, eventSnap] = await Promise.all([readActorInTransaction(transaction, context.auth.uid), transaction.get(eventRef)]);
    if (!hasPermission(actor.user, actor.roleDefaults, "bible.quickProjection")) {
      throw new functions.https.HttpsError("permission-denied", "No tienes permiso para retirar puntos del mensaje.");
    }
    if (!eventSnap.exists) throw new functions.https.HttpsError("not-found", "El evento ya no esta disponible.");
    const state = eventSnap.get("projectorState");
    if (state?.type !== "preaching" || state?.contentType !== "quickMessage" || state.projectionActionId !== projectionActionId) {
      throw new functions.https.HttpsError("failed-precondition", "El punto ya no es la proyeccion activa.");
    }
    if (!hasRestorableQuickMessageSnapshot(state.previousProjectionFields)) {
      throw new functions.https.HttpsError("failed-precondition", "No existe un estado anterior seguro para restaurar.");
    }
    transaction.update(eventRef, cloneProjectionValue(state.previousProjectionFields));
    return { ok: true };
  });
});

exports.updateQuickMessageHistory = functions.https.onCall(async (data, context) => {
  if (!context.auth?.uid) throw new functions.https.HttpsError("unauthenticated", "Debes iniciar sesion.");
  if (!isPlainObject(data)) throw new functions.https.HttpsError("invalid-argument", "Payload invalido.");

  const operation = assertNonEmptyString(data.operation, "operation");
  if (!new Set(["remove", "clear"]).has(operation)) {
    throw new functions.https.HttpsError("invalid-argument", "Operacion de historial invalida.");
  }

  const expectedKeys = operation === "clear"
    ? ["eventoId", "operation"]
    : ["eventoId", "operation", "entryId"];
  assertExactPayload(data, expectedKeys);

  const eventoId = assertNonEmptyString(data.eventoId, "eventoId");
  if (eventoId.length > 256) throw new functions.https.HttpsError("invalid-argument", "Evento invalido.");
  const entryId = operation === "remove" ? assertQuickMessageHistoryEntryId(data.entryId) : null;

  const db = admin.firestore();
  const eventRef = db.collection("eventos").doc(eventoId);
  return db.runTransaction(async (transaction) => {
    const [actor, eventSnap] = await Promise.all([
      readActorInTransaction(transaction, context.auth.uid),
      transaction.get(eventRef)
    ]);
    if (!hasPermission(actor.user, actor.roleDefaults, "bible.quickProjection")) {
      throw new functions.https.HttpsError("permission-denied", "No tienes permiso para gestionar puntos del mensaje.");
    }
    if (!eventSnap.exists) throw new functions.https.HttpsError("not-found", "El evento ya no esta disponible.");

    const currentHistory = Array.isArray(eventSnap.get("quickMessageHistory"))
      ? eventSnap.get("quickMessageHistory")
      : [];
    const nextHistory = operation === "clear"
      ? []
      : currentHistory.filter((item) => item?.id !== entryId);

    transaction.update(eventRef, { quickMessageHistory: nextHistory });
    return { ok: true, history: nextHistory };
  });
});

// The editor can contain both capabilities. Dispatching remains server-side so
// the client never decides which protected part of ChordPro changed.
exports.updateSongContent = functions.https.onCall(async (data, context) => {
  if (!context.auth?.uid) throw new functions.https.HttpsError("unauthenticated", "Debes iniciar sesion.");
  const songId = assertSongPayload(data, ["songId", "letraRaw"]);
  const letraRaw = assertSongText(data.letraRaw);
  const db = admin.firestore(); const ref = db.collection("canciones").doc(songId);
  return db.runTransaction(async (transaction) => {
    const [actor, songSnap] = await Promise.all([readActorInTransaction(transaction, context.auth.uid), transaction.get(ref)]);
    if (!songSnap.exists) throw new functions.https.HttpsError("not-found", "La cancion no existe.");
    const previous = songSnap.get("letraRaw") || "";
    const chordsOnly = canEditChordsOnly(previous, letraRaw);
    const lyricsOnly = canEditLyricsOnly(previous, letraRaw);
    const permission = chordsOnly && !lyricsOnly ? "songs.editChords" : lyricsOnly && !chordsOnly ? "songs.editLyrics" : null;
    if (!permission || !hasPermission(actor.user, actor.roleDefaults, permission)) throw new functions.https.HttpsError("permission-denied", "El cambio debe limitarse a letra o acordes con el permiso correspondiente.");
    transaction.update(ref, { letraRaw, fechaActualizacion: new Date().toISOString() });
    transaction.set(ref.collection("permissionAudit").doc(), songAuditData(actor, permission, ["letraRaw"]));
    return { ok: true, operation: permission };
  });
});

exports.updateSongMetadata = functions.https.onCall(async (data, context) => {
  if (!context.auth?.uid) throw new functions.https.HttpsError("unauthenticated", "Debes iniciar sesion.");
  const songId = assertSongPayload(data, ["songId", "changes"]);
  const fields = assertMetadataChanges(data.changes);
  const db = admin.firestore(); const ref = db.collection("canciones").doc(songId);
  await db.runTransaction(async (transaction) => {
    const [actor, songSnap] = await Promise.all([readActorInTransaction(transaction, context.auth.uid), transaction.get(ref)]);
    if (!hasPermission(actor.user, actor.roleDefaults, "songs.editMetadata")) throw new functions.https.HttpsError("permission-denied", "No tienes permiso para esta operacion.");
    if (fields.some((field) => SONG_MEDIA_FIELDS.has(field)) && !hasPermission(actor.user, actor.roleDefaults, "songs.manageMedia")) throw new functions.https.HttpsError("permission-denied", "No tienes permiso para gestionar archivos de canciones.");
    if (!songSnap.exists) throw new functions.https.HttpsError("not-found", "La cancion no existe.");
    transaction.update(ref, { ...data.changes, fechaActualizacion: new Date().toISOString() });
    transaction.set(ref.collection("permissionAudit").doc(), songAuditData(actor, "songs.editMetadata", fields));
  });
  return { ok: true };
});

exports.setSongArchiveState = functions.https.onCall(async (data, context) => {
  if (!context.auth?.uid) throw new functions.https.HttpsError("unauthenticated", "Debes iniciar sesion.");
  const songId = assertSongPayload(data, ["songId", "archived"]);
  if (typeof data.archived !== "boolean") throw new functions.https.HttpsError("invalid-argument", "Estado invalido.");
  const db = admin.firestore(); const ref = db.collection("canciones").doc(songId);
  await db.runTransaction(async (transaction) => {
    const [actor, songSnap] = await Promise.all([readActorInTransaction(transaction, context.auth.uid), transaction.get(ref)]);
    if (!hasPermission(actor.user, actor.roleDefaults, "songs.archive")) throw new functions.https.HttpsError("permission-denied", "No tienes permiso para esta operacion.");
    if (!songSnap.exists) throw new functions.https.HttpsError("not-found", "La cancion no existe.");
    const now = new Date().toISOString();
    const changes = data.archived
      ? { estado: "archived", archived: true, archivedAt: now, archivedBy: actor.uid, fechaActualizacion: now }
      : { estado: "active", archived: false, archivedAt: null, archivedBy: null, restoredAt: now, fechaActualizacion: now };
    transaction.update(ref, changes);
    transaction.set(ref.collection("permissionAudit").doc(), songAuditData(actor, data.archived ? "songs.archive" : "songs.restore", ["estado", "archived"]));
  });
  return { ok: true };
});

const assertLiveEvent = (eventoId, eventData) => {
  if (eventoId === "global") {
    throw new functions.https.HttpsError("failed-precondition", "El evento global no admite cambios de setlist.");
  }
  if (eventData.estado === "cancelado") {
    throw new functions.https.HttpsError("failed-precondition", "El evento est\u00e1 cancelado.");
  }
  if (eventData.completado === true) {
    throw new functions.https.HttpsError("failed-precondition", "El evento ya finaliz\u00f3.");
  }
};

const getEventSetlistItems = (eventData = {}) => {
  const modernItems = Array.isArray(eventData.setlist)
    ? eventData.setlist
      .map((item, index) => {
        const source = isPlainObject(item) ? item : {};
        const type = source.type || "song";
        const value = source.value || source.songId || source.id;
        const idLocal = source.idLocal || source.setlistItemId || `${value || "item"}_${index}`;

        if (!value && type !== "note") return null;
        return { ...source, idLocal, type, value };
      })
      .filter(Boolean)
    : [];

  if (modernItems.length || !Array.isArray(eventData.canciones) || eventData.canciones.length === 0) {
    return modernItems;
  }

  return eventData.canciones
    .map((item, index) => {
      const songId = typeof item === "string" ? item : item?.id || item?.songId || item?.value;
      return songId ? { idLocal: `legacy_${songId}_${index}`, type: "song", value: songId } : null;
    })
    .filter(Boolean);
};

const getSetlistSongIds = (setlistItems) => (
  setlistItems
    .filter((item) => item?.type === "song")
    .map((item) => item.value || item.songId || item.id)
    .filter(Boolean)
);

const buildInactiveSongLiveState = (contentTitle, updatedBy) => ({
  activeSongId: null,
  activeSongTitle: "",
  activeSongIndex: -1,
  activeSectionIndex: -1,
  activeSectionTitle: "",
  activeContentType: "none",
  activeContentTitle: contentTitle,
  updatedAt: Date.now(),
  updatedBy
});

const isArchivedSong = (song = {}) => (
  song.estado === "archived" || song.status === "archived" || song.archived === true
);

const isActiveSong = (eventData, songId) => (
  eventData.liveState?.activeSongId === songId ||
  eventData.currentSongId === songId ||
  eventData.proyectorSongId === songId
);

const buildSetlistUpdate = (setlistItems) => ({
  setlist: setlistItems,
  canciones: getSetlistSongIds(setlistItems)
});

exports.agregarCancionEnVivo = functions.https.onCall(async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError("unauthenticated", "Debes iniciar sesi\u00f3n.");
  }

  assertExactPayload(data, ["eventoId", "songId"]);
  const eventoId = assertNonEmptyString(data.eventoId, "eventoId");
  const songId = assertNonEmptyString(data.songId, "songId");
  const actor = await assertLiveSetlistAccess(context.auth.uid, "setlists.addSong");
  const db = admin.firestore();
  const eventRef = db.collection("eventos").doc(eventoId);
  const songRef = db.collection("canciones").doc(songId);

  return db.runTransaction(async (transaction) => {
    const [eventSnap, songSnap] = await Promise.all([
      transaction.get(eventRef),
      transaction.get(songRef)
    ]);

    if (!eventSnap.exists) {
      throw new functions.https.HttpsError("not-found", "El evento ya no est\u00e1 disponible.");
    }
    if (!songSnap.exists || isArchivedSong(songSnap.data())) {
      throw new functions.https.HttpsError("failed-precondition", "La canci\u00f3n ya no est\u00e1 disponible.");
    }

    const eventData = eventSnap.data();
    assertLiveEvent(eventoId, eventData);
    const setlistItems = getEventSetlistItems(eventData);

    if (setlistItems.some((item) => item.type === "song" && item.value === songId)) {
      return { ok: false, code: "already-present" };
    }

    const addedItem = {
      idLocal: `extra_${randomUUID()}`,
      type: "song",
      value: songId
    };
    const nextSetlist = [...setlistItems, addedItem];
    transaction.update(eventRef, buildSetlistUpdate(nextSetlist));

    return { ok: true, item: addedItem, actorRole: actor.role };
  });
});

exports.quitarCancionEnVivo = functions.https.onCall(async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError("unauthenticated", "Debes iniciar sesi\u00f3n.");
  }

  assertExactPayload(data, ["eventoId", "idLocal"]);
  const eventoId = assertNonEmptyString(data.eventoId, "eventoId");
  const idLocal = assertNonEmptyString(data.idLocal, "idLocal");
  if (!idLocal.startsWith("extra_")) {
    throw new functions.https.HttpsError("failed-precondition", "Solo se pueden quitar canciones agregadas en vivo.");
  }

  const actor = await assertLiveSetlistAccess(context.auth.uid, "setlists.removeSong");
  const db = admin.firestore();
  const eventRef = db.collection("eventos").doc(eventoId);

  return db.runTransaction(async (transaction) => {
    const eventSnap = await transaction.get(eventRef);
    if (!eventSnap.exists) {
      throw new functions.https.HttpsError("not-found", "El evento ya no est\u00e1 disponible.");
    }

    const eventData = eventSnap.data();
    assertLiveEvent(eventoId, eventData);
    const setlistItems = getEventSetlistItems(eventData);
    const itemToRemove = setlistItems.find((item) => item.idLocal === idLocal);

    if (!itemToRemove) {
      throw new functions.https.HttpsError("not-found", "La canci\u00f3n agregada ya no existe.");
    }
    if (itemToRemove.type !== "song" || !String(itemToRemove.idLocal).startsWith("extra_")) {
      throw new functions.https.HttpsError("failed-precondition", "Solo se pueden quitar canciones agregadas en vivo.");
    }

    const nextSetlist = setlistItems.filter((item) => item.idLocal !== idLocal);
    const updates = buildSetlistUpdate(nextSetlist);

    if (isActiveSong(eventData, itemToRemove.value)) {
      updates.currentSongId = null;
      updates.liveState = buildInactiveSongLiveState("Cancion removida del setlist", actor.user.nombre || actor.user.email || "Multimedia");
      updates.proyectorSongId = null;
      updates.proyectorSlide = null;
      updates.proyectorSlideIndex = -1;
      updates.proyectorNextSlide = null;
      updates.proyectorNextSong = null;
    }

    transaction.update(eventRef, updates);
    return { ok: true, removedSongId: itemToRemove.value, clearedActiveSong: isActiveSong(eventData, itemToRemove.value), actorRole: actor.role };
  });
});

/**
 * Helper to sanitize topic names for FCM.
 * Topic names must match the regex: [a-zA-Z0-9-_.~%]+
 * This function normalizes names like "Guitarra Eléctrica" to "Guitarra_Electrica".
 * @param {string} name The raw name of the role or instrument.
 * @return {string} A sanitized name suitable for an FCM topic.
 */
const sanitizeTopicName = (name) =>
  name.normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9-_.~%]+/g, "_");

const normalizeAccountStatus = (status) => {
  if (status === "suspended" || status === "Suspendida") return "suspended";
  if (status === "disabled" || status === "Desactivada") return "disabled";
  return "active";
};

const canReceiveRegularPush = (user) => normalizeAccountStatus(user.accountStatus) === "active";

const isAccountStatusException = (notif) =>
  notif.accountStatusException === "suspension" ||
  notif.accountStatusException === "reactivation";

/**
 * Cloud Function that sends a push notification when a new document is added
 * to the 'notificaciones' collection.
 * It uses a hybrid approach:
 * - Topic-based sending for general notifications (efficient).
 * - Token-based sending for direct messages or notifications with exclusions.
 */
exports.enviarNotificacionPush = functions.firestore
  .document("notificaciones/{notifId}")
  .onCreate(async (snap, context) => {
    const notif = snap.data();
    const destinatarios = notif.destinatarios || [];
    const emisorId = notif.emisorId;
    const excluidos = notif.excluidos || [];
    const allowStatusException = isAccountStatusException(notif);

    if (destinatarios.length === 0) {
      console.log("No destinatarios, exiting.");
      return null;
    }

    const messagePayload = {
      data: { url: notif.url || "/" },
      notification: { title: notif.titulo, body: notif.mensaje },
      android: { // Configuración para Android
        priority: "high",
        notification: { 
          sound: "default",
          channelId: "urgente", // Cambiamos a un ID de canal que configuraremos como 'alto'
          priority: "max",
          visibility: "public",
          notificationPriority: "PRIORITY_MAX"
        },
      },
      webpush: { // Configuración para Web (PWA)
        headers: { Urgency: "high" },
        notification: {
          icon: "/KADOSH_APP.jpg",
          requireInteraction: true,
        },
      },
    };

    // Usamos Tokens si hay exclusiones o si los destinatarios no son el grupo global "all"
    const usarTokens = allowStatusException || excluidos.length > 0 || !destinatarios.includes("all");

    if (usarTokens) {
      console.log("Iniciando envío por Tokens (Máxima precisión)");
      const usersSnapshot = await admin.firestore().collection("usuarios").get();
      const tokens = [];
      usersSnapshot.forEach((doc) => {
        const user = doc.data();
        const userId = doc.id;

        if (userId === emisorId || excluidos.includes(userId)) {
          return;
        }

        const isForMe = destinatarios.includes("all") ||
                        destinatarios.includes(userId) ||
                        (user.rol && destinatarios.includes(user.rol)) ||
                        (user.instrumentos && user.instrumentos.some((i) => destinatarios.includes(i)));

        if (isForMe && user.fcmToken && (allowStatusException || canReceiveRegularPush(user))) {
          tokens.push(user.fcmToken);
        }
      });

      if (tokens.length > 0) {
        const messages = tokens.map(token => ({
          ...messagePayload,
          token: token
        }));

        // Enviar en grupos de 500 (límite de Firebase)
        for (let i = 0; i < tokens.length; i += 500) {
          try {
            const response = await admin.messaging().sendEach(messages.slice(i, i + 500));
            console.log(`${response.successCount} notificaciones enviadas por lista de tokens.`);
          } catch (error) {
            console.error("Error sending Push via token list:", error);
          }
        }
      } else {
        console.log("No devices with token for this alert (token-based).");
      }
      return null;
    }

    // NEW TOPIC-BASED APPROACH
    console.log("Usando envío basado en Temas para:", destinatarios);

    const conditions = destinatarios.map((dest) => {
      if (dest === "all") {
        return "'all' in topics";
      }
      // It's a role or an instrument.
      const sanitized = sanitizeTopicName(dest);
      return `'rol_${sanitized}' in topics || 'instrumento_${sanitized}' in topics`;
    });

    if (conditions.length === 0) {
      console.log("No valid topic conditions found for this notification.");
      return null;
    }

    const condition = conditions.join(" || ");
    const message = { ...messagePayload, condition };

    try {
      const response = await admin.messaging().send(message);
      console.log(`Successfully sent message to condition: ${condition}`, response);
    } catch (error) {
      console.error("Error sending topic-based Push:", error, "Condition:", condition);
    }

    return null;
  });

/**
 * NUEVA FUNCIÓN PROGRAMADA: Recordatorio de Eventos Próximos.
 * Se ejecuta todos los días a las 8:00 AM.
 * Busca eventos en las próximas 24 horas y envía un recordatorio.
 */
exports.enviarRecordatoriosDeEventos = functions.pubsub
  .schedule("every day 08:00")
  .timeZone("America/Guayaquil") // 🚨 ¡IMPORTANTE! Ajusta a tu zona horaria.
  .onRun(async (context) => {
    console.log("Ejecutando recordatorios de eventos...");

    const ahora = new Date();
    const manana = new Date(ahora.getTime() + 24 * 60 * 60 * 1000);

    const eventosQuery = admin.firestore().collection("eventos")
      .where("fecha", ">=", ahora.toISOString())
      .where("fecha", "<=", manana.toISOString());

    const eventosSnap = await eventosQuery.get();

    if (eventosSnap.empty) {
      console.log("No hay eventos en las próximas 24 horas.");
      return null;
    }

    for (const doc of eventosSnap.docs) {
      const evento = doc.data();
      const convocados = evento.equipo?.map(item => typeof item === 'string' ? item : item.id) || [];

      // Evitar enviar recordatorios múltiples para el mismo evento
      if (convocados.length > 0 && !evento.recordatorioEnviado) {
        // Marcar el evento para no volver a enviarle un recordatorio
        await admin.firestore().collection("eventos").doc(doc.id).update({ recordatorioEnviado: true });

        await admin.firestore().collection("notificaciones").add({
          titulo: `⏰ Recordatorio: ${evento.titulo}`,
          mensaje: `¡No lo olvides! El evento es hoy. Revisa los últimos detalles en la app.`,
          destinatarios: convocados,
          emisorId: "system-scheduler",
          url: `/setlist/${doc.id}`,
          fechaCreacion: new Date().toISOString(),
        });
        console.log(`Recordatorio enviado para el evento: ${evento.titulo}`);
      }
    }

    return null;
  });

/**
 * Manages FCM topic subscriptions for a user when their profile is created,
 * updated, or deleted. This keeps subscriptions in sync with their roles
 * and instruments.
 */
exports.manageUserTopics = functions.firestore
    .document("usuarios/{userId}")
    .onWrite(async (change, context) => {
      const beforeData = change.before.data();
      const afterData = change.after.data();

      // User is deleted or has no token, unsubscribe from all known topics
      if (!change.after.exists || !afterData.fcmToken) {
        const token = beforeData?.fcmToken;
        if (!token) return null; // Nothing to do

        const topicsToUnsubscribe = new Set();
        const oldRoles = beforeData.rol ? [beforeData.rol] : [];
        const oldInstruments = beforeData.instrumentos || [];
        oldRoles.forEach((r) => topicsToUnsubscribe.add(`rol_${sanitizeTopicName(r)}`));
        oldInstruments.forEach((i) => topicsToUnsubscribe.add(`instrumento_${sanitizeTopicName(i)}`));
        topicsToUnsubscribe.add("all");

        for (const topic of topicsToUnsubscribe) {
          try {
            await admin.messaging().unsubscribeFromTopic(token, topic);
            console.log(`Unsubscribed ${context.params.userId} from ${topic}`);
          } catch (error) {
            console.error(`Error unsubscribing from ${topic}`, error);
          }
        }
        return null;
      }

      // On create or update, manage subscriptions
      const token = afterData.fcmToken;
      if (!token) {
        console.log(`User ${context.params.userId} has no FCM token. Skipping topic management.`);
        return null;
      }

      const accountIsActive = canReceiveRegularPush(afterData);

      const oldTopics = new Set();
      if (change.before.exists) {
        const oldRoles = beforeData.rol ? [beforeData.rol] : [];
        const oldInstruments = beforeData.instrumentos || [];
        oldRoles.forEach((r) => oldTopics.add(`rol_${sanitizeTopicName(r)}`));
        oldInstruments.forEach((i) => oldTopics.add(`instrumento_${sanitizeTopicName(i)}`));
        oldTopics.add("all");
      }

      if (!accountIsActive) {
        const currentRoles = afterData.rol ? [afterData.rol] : [];
        const currentInstruments = afterData.instrumentos || [];
        currentRoles.forEach((r) => oldTopics.add(`rol_${sanitizeTopicName(r)}`));
        currentInstruments.forEach((i) => oldTopics.add(`instrumento_${sanitizeTopicName(i)}`));
        oldTopics.add("all");

        await Promise.all([...oldTopics].map((topic) =>
          admin.messaging().unsubscribeFromTopic(token, topic)
            .then(() => console.log(`Suspended/disabled user ${context.params.userId} unsubscribed from ${topic}`))
            .catch((e) => console.error(`Error unsubscribing inactive user from ${topic}`, e))
        ));
        return null;
      }

      const newTopics = new Set();
      const newRoles = afterData.rol ? [afterData.rol] : [];
      const newInstruments = afterData.instrumentos || [];
      newRoles.forEach((r) => newTopics.add(`rol_${sanitizeTopicName(r)}`));
      newInstruments.forEach((i) => newTopics.add(`instrumento_${sanitizeTopicName(i)}`));
      newTopics.add("all");

      const topicsToSubscribe = [...newTopics].filter((t) => !oldTopics.has(t));
      const topicsToUnsubscribe = [...oldTopics].filter((t) => !newTopics.has(t));

      await Promise.all([
        ...topicsToSubscribe.map((topic) => admin.messaging().subscribeToTopic(token, topic).then(() => console.log(`Subscribed ${context.params.userId} to ${topic}`)).catch((e) => console.error(`Error subscribing to ${topic}`, e))),
        ...topicsToUnsubscribe.map((topic) => admin.messaging().unsubscribeFromTopic(token, topic).then(() => console.log(`Unsubscribed ${context.params.userId} from ${topic}`)).catch((e) => console.error(`Error unsubscribing from ${topic}`, e))),
      ]);

      return null;
    });

/**
 * FUNCIÓN PROGRAMADA: Cálculo de Estadísticas.
 * Se ejecuta todos los días a las 3:00 AM.
 * Calcula las estadísticas de uso y las guarda en un único documento para lectura rápida.
 */
exports.calcularEstadisticasDiarias = functions.pubsub
  .schedule("every day 03:00")
  .timeZone("America/Guayaquil") // 🚨 ¡IMPORTANTE! Ajusta a tu zona horaria.
  .onRun(async (context) => {
    console.log("Ejecutando cálculo de estadísticas diarias...");

    const db = admin.firestore();

    try {
      // Cargar todas las canciones para mapear sus IDs a Títulos
      const songsSnap = await db.collection("canciones").get();
      const songsMap = {};
      songsSnap.forEach((doc) => {
        songsMap[doc.id] = doc.data().titulo;
      });

      // Cargar historial de eventos para calcular estadísticas
      const eventsSnap = await db.collection("eventos").get();
      const songCounts = {};
      const singerCounts = {};

      eventsSnap.forEach((doc) => {
        const ev = doc.data();
        const songIds = ev.setlist ? ev.setlist.filter((i) => i.type === "song").map((i) => i.value) : (ev.canciones || []);
        songIds.forEach((id) => {
          songCounts[id] = (songCounts[id] || 0) + 1;
        });
        if (ev.cantantesPorCancion) {
          Object.values(ev.cantantesPorCancion).forEach((singer) => {
            if (singer && singer.trim() !== "") {
              singerCounts[singer] = (singerCounts[singer] || 0) + 1;
            }
          });
        }
      });

      const sortedSongs = Object.entries(songCounts).map(([id, count]) => ({titulo: songsMap[id] || "Canción Eliminada", count})).sort((a, b) => b.count - a.count).slice(0, 5);
      const sortedSingers = Object.entries(singerCounts).map(([nombre, count]) => ({nombre, count})).sort((a, b) => b.count - a.count).slice(0, 5);

      const estadisticas = {topCanciones: sortedSongs, topCantantes: sortedSingers, totalEventos: eventsSnap.size, totalCanciones: songsSnap.size, ultimaActualizacion: new Date().toISOString()};

      await db.collection("sistema").doc("estadisticas").set(estadisticas);
      console.log("Estadísticas diarias calculadas y guardadas exitosamente.");
      return null;
    } catch (error) {
      console.error("Error al calcular estadísticas diarias:", error);
      return null;
    }
  });
