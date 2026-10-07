// src/config/firebase.js
// Añade esta importación arriba
import { getMessaging, isSupported } from 'firebase/messaging';
import { initializeApp } from "firebase/app";
import { 
  getFirestore, 
  initializeFirestore, 
  connectFirestoreEmulator,
  persistentLocalCache, 
  persistentMultipleTabManager 
} from "firebase/firestore";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFunctionsEmulator, getFunctions } from "firebase/functions";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_API_KEY,
  authDomain: import.meta.env.VITE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_APP_ID
};

const app = initializeApp(firebaseConfig);

// Habilitar persistencia offline optimizada
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});

const auth = getAuth(app);
const functions = getFunctions(app);

const useFirebaseEmulators = import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true';

if (useFirebaseEmulators) {
  const emulatorHost = import.meta.env.VITE_FIREBASE_EMULATOR_HOST || '127.0.0.1';
  connectAuthEmulator(auth, `http://${emulatorHost}:${import.meta.env.VITE_AUTH_EMULATOR_PORT || '9099'}`, {
    disableWarnings: true,
  });
  connectFirestoreEmulator(db, emulatorHost, Number(import.meta.env.VITE_FIRESTORE_EMULATOR_PORT || 8080));
  connectFunctionsEmulator(functions, emulatorHost, Number(import.meta.env.VITE_FUNCTIONS_EMULATOR_PORT || 5001));
}

export { db, auth, functions };

// Añade esta línea al final del archivo
let messagingPromise = null;

export const getMessagingIfSupported = () => {
  if (!messagingPromise) {
    messagingPromise = isSupported()
      .then((supported) => (supported ? getMessaging(app) : null))
      .catch(() => null);
  }
  return messagingPromise;
};
