import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import LiveModeUI from './components/live/LiveModeUI';
import Proyector from './components/live/Proyector';
import ProyectorController from './components/live/ProyectorController';
import StageDisplay from './components/live/StageDisplay';
import StageDisplayMusicos from './components/live/StageDisplayMusicos';
import AdminLayout from './components/layout/AdminLayout';
import AdminDashboard from './components/admin/AdminDashboard';
import Login from './components/layout/Login';
import AddSongAI from './components/admin/AddSongAI';
import SongList from './components/admin/SongList';
import EditSong from './components/admin/EditSong';
import UserManagement from './components/admin/UserManagement';
import EventManagement from './components/admin/EventManagement';
import SetlistViewer from './components/admin/SetlistViewer';
import UserProfile from './components/admin/UserProfile';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot, updateDoc } from 'firebase/firestore';
import { getToken, onMessage } from 'firebase/messaging';
import { db, messaging } from './config/firebase';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { App as CapacitorApp } from '@capacitor/app';

function App() {
  const [user, setUser] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  useEffect(() => {
    const auth = getAuth();
    let unsubscribeSnapshot = null;

    // 1. Lógica de Notificaciones (Independiente del Auth para asegurar que pida permisos)
    const inicializarNotificaciones = async (uid, userData) => {
      try {
        if (Capacitor.isNativePlatform()) {
          // 📱 MODO NATIVO (APK)
          let permStatus = await PushNotifications.checkPermissions();
          
          if (permStatus.receive === 'prompt' || permStatus.receive === 'denied') {
            permStatus = await PushNotifications.requestPermissions();
          }

          if (permStatus.receive === 'granted') {
            // Configurar listeners ANTES de registrar para no perder el primer token
            PushNotifications.removeAllListeners();
            
            PushNotifications.addListener('registration', async (token) => {
              console.log('FCM Token recibido:', token.value);
              if (token.value !== userData?.fcmToken) {
                const userRef = doc(db, 'usuarios', uid);
                await updateDoc(userRef, { fcmToken: token.value });
              }
            });

            PushNotifications.addListener('registrationError', (error) => {
              console.error('Error en registro nativo:', error);
            });

            PushNotifications.addListener('pushNotificationReceived', (notification) => {
              alert(`🔔 ${notification.title}\n${notification.body}`);
            });

            PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
              const data = notification.notification.data;
              if (data && data.url) window.location.href = data.url;
            });

            await PushNotifications.register();
          }
        } else {
          // 💻 MODO WEB (PWA)
          const permission = await Notification.requestPermission();
          if (import.meta.env.VITE_VAPID_KEY && permission === 'granted') {
            const currentToken = await getToken(messaging, { vapidKey: import.meta.env.VITE_VAPID_KEY });
            if (currentToken && currentToken !== userData?.fcmToken) {
              const userRef = doc(db, 'usuarios', uid);
              await updateDoc(userRef, { fcmToken: currentToken });
            }

            onMessage(messaging, (payload) => {
              alert(`🔔 ${payload.notification.title}\n${payload.notification.body}`);
            });
          }
        }
      } catch (error) {
        console.warn('Error en el flujo de notificaciones:', error);
      }
    };

    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const docRef = doc(db, 'usuarios', firebaseUser.uid);
        
        const docSnap = await getDoc(docRef);
        let currentData = null;

        if (!docSnap.exists()) {
          const esElDueno = firebaseUser.email === import.meta.env.VITE_OWNER_EMAIL;
          const userData = { email: firebaseUser.email, nombre: esElDueno ? 'Dueño Principal' : 'Usuario Nuevo', rol: esElDueno ? 'dueño' : 'musico', fechaCreacion: new Date().toISOString() };
          await setDoc(docRef, userData);
          currentData = userData;
        } else {
          currentData = docSnap.data();
        }

        // Disparamos la lógica de notificaciones
        inicializarNotificaciones(firebaseUser.uid, currentData);

        // Escuchamos los cambios del perfil en TIEMPO REAL
        unsubscribeSnapshot = onSnapshot(docRef, (snap) => {
          if (snap.exists()) {
            const userData = snap.data();
            // Migración silenciosa: Si un usuario antiguo tiene guardado el viejo tamaño 24, lo forzamos a 16
            if (userData.preferencias?.fontSize === 24) {
              updateDoc(docRef, { 'preferencias.fontSize': 16 }).catch(e => console.error(e));
              userData.preferencias.fontSize = 16;
            }
            setUser({ uid: firebaseUser.uid, email: firebaseUser.email, ...userData });
          }
          setLoadingAuth(false);
        });

      } else {
        setUser(null);
        setLoadingAuth(false);
        if (unsubscribeSnapshot) unsubscribeSnapshot();
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeSnapshot) unsubscribeSnapshot();
    };
  }, []);

  // Extraemos las preferencias de forma segura (con el ?.) ANTES de cualquier "return"
  const userPreferences = {
    darkMode: user?.preferencias?.darkMode ?? false,
    fontSize: user?.preferencias?.fontSize ?? 16,
    ocultarAcordes: user?.preferencias?.ocultarAcordes ?? false,
    formatoAcordes: user?.preferencias?.formatoAcordes || 'american',
    themeColor: user?.preferencias?.themeColor || 'violet',
    notacion: user?.preferencias?.notacion || 'sharps' // 'sharps' (#) o 'flats' (b)
  };

  // EFECTO PARA APLICAR EL MODO OSCURO A TODA LA PÁGINA (Siempre arriba)
  useEffect(() => {
    const root = document.documentElement;
    if (userPreferences.darkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [userPreferences.darkMode]);

  // EFECTO PARA MANEJAR EL BOTÓN DE RETROCESO EN ANDROID
  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      CapacitorApp.addListener('backButton', ({ canGoBack }) => {
        if (canGoBack) {
          window.history.back();
        } else {
          CapacitorApp.exitApp();
        }
      });
    }
  }, []);

  if (loadingAuth) {
    return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-500 font-bold animate-pulse">Cargando Kadosh App...</div>;
  }

  if (!user) {
    return <Login />;
  }

  return (
    <Router>
      <Routes>
        {/* Rutas de Administración (Envueltas en el Layout) */}
        <Route path="/" element={<AdminLayout user={user}><AdminDashboard user={user} /></AdminLayout>} />
        <Route path="/canciones" element={<AdminLayout user={user}><SongList user={user} /></AdminLayout>} />
        <Route path="/añadir" element={<AdminLayout user={user}><AddSongAI user={user} /></AdminLayout>} />
        <Route path="/editar/:id" element={<AdminLayout user={user}><EditSong user={user} /></AdminLayout>} />
        <Route path="/equipo" element={<AdminLayout user={user}><UserManagement user={user} /></AdminLayout>} />
        <Route path="/eventos" element={<AdminLayout user={user}><EventManagement user={user} /></AdminLayout>} />
        <Route path="/setlist/:id" element={<AdminLayout user={user}><SetlistViewer user={user} /></AdminLayout>} />
        <Route path="/perfil" element={<AdminLayout user={user}><UserProfile user={user} /></AdminLayout>} />
        
        {/* Ruta del Modo Culto (Pantalla Completa, SIN Layout) */}
        <Route path="/live/:id" element={
          <LiveModeUI user={user} esGuitarrista={true} preferences={userPreferences} />
        } />
        
        {/* Ruta Pública del Proyector para la Congregación */}
        <Route path="/proyector/:eventoId" element={<Proyector />} />
        
        {/* Ruta Privada de Retorno para los Músicos en Tarima */}
        <Route path="/retorno/:eventoId" element={<StageDisplay />} />
        <Route path="/retorno-musicos/:eventoId" element={<StageDisplayMusicos />} />
        
        {/* Ruta del Controlador Multimedia */}
        <Route path="/control-proyector/:eventoId" element={<ProyectorController user={user} />} />
      </Routes>
    </Router>
  );
}

export default App;
