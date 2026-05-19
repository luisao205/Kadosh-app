// src/config/firebase.js
// Añade esta importación arriba
import { getMessaging } from 'firebase/messaging';
import { initializeApp } from "firebase/app";
import { 
  getFirestore, 
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager 
} from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyCYRYwA77qz7ASeJNGi23w8E2jBvfjmLqs",
  authDomain: "kadosh-49600.firebaseapp.com",
  projectId: "kadosh-49600",
  storageBucket: "kadosh-49600.firebasestorage.app",
  messagingSenderId: "474316353062",
  appId: "1:474316353062:web:639cf5645d9ba7b0c200e7"
};

const app = initializeApp(firebaseConfig);

// Habilitar persistencia offline optimizada
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});

const auth = getAuth(app);

export { db, auth };

// Añade esta línea al final del archivo
export const messaging = getMessaging(app);