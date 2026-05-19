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
import { getToken } from 'firebase/messaging';
import { db, messaging } from './config/firebase';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';

function App() {
  const [user, setUser] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  useEffect(() => {
    const auth = getAuth();
    let unsubscribeSnapshot = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const docRef = doc(db, 'usuarios', firebaseUser.uid);
        
        // Comprobamos si el perfil existe, si no, lo creamos
        const docSnap = await getDoc(docRef);
        if (!docSnap.exists()) {
          // Si la cuenta se creó antes de tener el sistema de roles, la registramos ahora.
          // IMPORTANTE: Cambia este correo por tu correo real con el que inicias sesión
          const MI_CORREO_MAESTRO = 'luistorresdrums2024@gmail.com'; 
          const esElDueno = firebaseUser.email === MI_CORREO_MAESTRO;
          
          const userData = { email: firebaseUser.email, nombre: esElDueno ? 'Dueño Principal' : 'Usuario Nuevo', rol: esElDueno ? 'dueño' : 'musico', fechaCreacion: new Date().toISOString() };
          
          // Lo guardamos en la base de datos automáticamente
          await setDoc(docRef, userData);
        }

          // Registrar Token de Notificaciones Push (FCM)
          try {
            if (Capacitor.isNativePlatform()) {
              // 📱 MODO NATIVO (APK / iOS)
              const permStatus = await PushNotifications.requestPermissions();
              if (permStatus.receive === 'granted') {
                await PushNotifications.register();
                
                PushNotifications.removeAllListeners();
                PushNotifications.addListener('registration', async (token) => {
                  await updateDoc(docRef, { fcmToken: token.value });
                });
                
                PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
                  const data = notification.notification.data;
                  if (data && data.url) window.location.href = data.url;
                });
              }
            } else {
              // 💻 MODO WEB (PWA / PC)
              if (import.meta.env.VITE_VAPID_KEY) {
                const currentToken = await getToken(messaging, { vapidKey: import.meta.env.VITE_VAPID_KEY });
                if (currentToken) {
                  await updateDoc(docRef, { fcmToken: currentToken });
                }
            }
            }
          } catch (error) {
            console.warn('Error al registrar notificaciones:', error);
          }

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
    themeColor: user?.preferencias?.themeColor || 'violet'
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
