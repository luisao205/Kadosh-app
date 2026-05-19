// public/firebase-messaging-sw.js

// Importamos los scripts de Firebase en segundo plano
importScripts('https://www.gstatic.com/firebasejs/10.8.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.1/firebase-messaging-compat.js');

// 🚨 REEMPLAZA LA API KEY CON LA NUEVA QUE GENERASTE
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
}

// Inicializamos Firebase en segundo plano
firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// Opcional: Manejo de notificaciones en segundo plano
messaging.onBackgroundMessage(function(payload) {
  console.log('[firebase-messaging-sw.js] Notificación recibida en segundo plano: ', payload);
  
  // 🚨 ATENCIÓN: Firebase ya dibuja automáticamente la notificación porque
  // nuestro servidor envía un paquete de tipo "notification".
  // El problema del retraso era la prioridad del servidor, no este archivo.
  
  // const notificationTitle = payload.notification.title;
  // const notificationOptions = { body: payload.notification.body, icon: '/KADOSH_APP.jpg' };
  // self.registration.showNotification(notificationTitle, notificationOptions);
});

// Manejar clic en la notificación estando en segundo plano
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.FCM_MSG?.data?.url || event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      return clients.openWindow(targetUrl);
    })
  );
});
