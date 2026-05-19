const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");

admin.initializeApp();

exports.enviarNotificacionPush = functions.firestore
  .document("notificaciones/{notifId}")
  .onCreate(async (snap, context) => {
    const notif = snap.data();
    const destinatarios = notif.destinatarios || [];
    const emisorId = notif.emisorId;
    const excluidos = notif.excluidos || [];

    // Si no hay destinatarios, terminamos la ejecución
    if (destinatarios.length === 0) return null;

    // Obtener a todos los usuarios para revisar quién debe recibirla
    const usersSnapshot = await admin.firestore().collection("usuarios").get();
    const tokens = [];

    usersSnapshot.forEach((doc) => {
      const user = doc.data();
      const userId = doc.id;

      // Regla anti-spam: No enviar notificación al que hizo la acción
      if (userId === emisorId) return;
      if (excluidos.includes(userId)) return; // No enviar al cumpleañero o excluidos

      const isForMe = destinatarios.includes("all") || destinatarios.includes(userId) || destinatarios.includes(user.rol) || (user.instrumentos && user.instrumentos.some((i) => destinatarios.includes(i)));

      // Si el usuario es destinatario y tiene su token de celular guardado
      if (isForMe && user.fcmToken) {
        tokens.push(user.fcmToken);
      }
    });

    if (tokens.length === 0) {
      console.log("No hay dispositivos con token para esta alerta.");
      return null;
    }

    const message = { 
      data: {
        url: notif.url || '/'
      },
      notification: { title: notif.titulo, body: notif.mensaje },
      android: {
        priority: 'high', // <-- OBLIGA a Android a despertar el teléfono
        notification: { sound: 'default' }
      },
      webpush: {
        headers: {
          Urgency: 'high' // <-- OBLIGA a navegadores web a mostrarla al instante
        },
        notification: {
          icon: '/KADOSH_APP.jpg',
          requireInteraction: true // <-- Hace que la notificación NO desaparezca hasta que la toques
        }
      },
      tokens: tokens 
    };

    try {
      const response = await admin.messaging().sendEachForMulticast(message);
      console.log(`${response.successCount} mensajes Push enviados idénticos a WhatsApp.`);
    } catch (error) {
      console.error("Error enviando Push:", error);
    }
    return null;
  });