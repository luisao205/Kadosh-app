import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import LiveModeUI from './components/live/LiveModeUI';
import Proyector from './components/live/Proyector';
import ProyectorController from './components/live/ProyectorController';
import StageDisplay from './components/live/StageDisplay';
import StageDisplayMusicos from './components/live/StageDisplayMusicos';
import MultimediaHub from './components/live/MultimediaHub';
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

    const inicializarNotificaciones = async (uid) => {
      try {
        if (Capacitor.isNativePlatform()) {
          // 📱 MODO NATIVO
          const channelCreated = await PushNotifications.createChannel({
            id: 'urgente',
            name: 'Alertas Urgentes Kadosh', // Nombre más descriptivo
            description: 'Notificaciones de setlists y eventos',
            importance: 5, // Prioridad Máxima
            visibility: 1,
            sound: 'default',
            vibration: true,
          });

          let perm = await PushNotifications.requestPermissions();
          
          if (perm.receive === 'granted') {
            PushNotifications.removeAllListeners();
            
            PushNotifications.addListener('registration', async (token) => {
              // Actualizamos el token siempre para asegurar que no sea uno viejo
              const userRef = doc(db, 'usuarios', uid);
              await updateDoc(userRef, { fcmToken: token.value, ultimaConexion: new Date().toISOString() });
              console.log('Token registrado con éxito');
            });

            PushNotifications.addListener('pushNotificationReceived', (notification) => {
              // Esto hace que vibre y suene si la App está abierta
              console.log('Notificación recibida:', notification);
            });

            PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
              // Esto hace que al tocar la notificación te lleve a la sección correcta
              const data = notification.notification.data;
              if (data && data.url) window.location.href = data.url;
            });

             await PushNotifications.register();
          } else {
            alert("Aviso: No has permitido las notificaciones. No recibirás avisos del setlist.");
          }
        } else {
          // 💻 MODO WEB
          if (!('Notification' in window)) return;
          
          const permission = await Notification.requestPermission();
          let registration = await navigator.serviceWorker.ready;
          
          if (!registration) return;


          if (import.meta.env.VITE_VAPID_KEY && permission === 'granted') {
             const currentToken = await getToken(messaging, { vapidKey: import.meta.env.VITE_VAPID_KEY });
            if (currentToken) {
              await updateDoc(doc(db, 'usuarios', uid), { fcmToken: currentToken });
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

        if (!docSnap.exists()) {
          const esElDueno = firebaseUser.email === import.meta.env.VITE_OWNER_EMAIL;
          const userData = { email: firebaseUser.email, nombre: esElDueno ? 'Dueño Principal' : 'Usuario Nuevo', rol: esElDueno ? 'dueño' : 'musico', fechaCreacion: new Date().toISOString() };
          await setDoc(docRef, userData);
        }

        // Disparamos la lógica de notificaciones inmediatamente
        inicializarNotificaciones(firebaseUser.uid);

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
        <Route path="/multimedia-hub" element={<AdminLayout user={user}><MultimediaHub user={user} /></AdminLayout>} />
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
