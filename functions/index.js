const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const { randomUUID } = require("crypto");

admin.initializeApp();

const LIVE_SETLIST_ROLES = new Set(["due\u00f1o", "dueno", "admin", "multimedia"]);

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

const assertLiveSetlistAccess = async (uid) => {
  const userSnap = await admin.firestore().collection("usuarios").doc(uid).get();
  const role = userSnap.exists ? userSnap.get("rol") : null;

  if (!LIVE_SETLIST_ROLES.has(role)) {
    throw new functions.https.HttpsError("permission-denied", "No tienes permisos para gestionar el setlist en vivo.");
  }

  return { uid, role, user: userSnap.data() || {} };
};

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
  if (Array.isArray(eventData.setlist)) {
    return eventData.setlist
      .map((item, index) => {
        const source = isPlainObject(item) ? item : {};
        const type = source.type || "song";
        const value = source.value || source.songId || source.id;
        const idLocal = source.idLocal || source.setlistItemId || `${value || "item"}_${index}`;

        if (!value && type !== "note") return null;
        return { ...source, idLocal, type, value };
      })
      .filter(Boolean);
  }

  if (Array.isArray(eventData.canciones)) {
    return eventData.canciones
      .map((item, index) => {
        const songId = typeof item === "string" ? item : item?.id || item?.songId || item?.value;
        return songId ? { idLocal: `legacy_${songId}_${index}`, type: "song", value: songId } : null;
      })
      .filter(Boolean);
  }

  return [];
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
  const actor = await assertLiveSetlistAccess(context.auth.uid);
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

  const actor = await assertLiveSetlistAccess(context.auth.uid);
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
