const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");

admin.initializeApp();

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

    // Forzamos envío por Tokens para máxima confiabilidad en equipos pequeños
    const tieneUsuariosEspecificos = destinatarios.some((d) => d !== "all");

    if (excluidos.length > 0 || tieneUsuariosEspecificos) {
      console.log("Usando envío basado en Tokens (Convocatoria/Privado/Exclusiones)");
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

        if (isForMe && user.fcmToken) {
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

      const oldTopics = new Set();
      if (change.before.exists) {
        const oldRoles = beforeData.rol ? [beforeData.rol] : [];
        const oldInstruments = beforeData.instrumentos || [];
        oldRoles.forEach((r) => oldTopics.add(`rol_${sanitizeTopicName(r)}`));
        oldInstruments.forEach((i) => oldTopics.add(`instrumento_${sanitizeTopicName(i)}`));
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