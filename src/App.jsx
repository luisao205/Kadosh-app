import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import LiveModeUI from './components/live/LiveModeUI';
import Proyector from './components/live/Proyector';
import ProyectorController from './components/live/ProyectorController';
import PreacherDisplay from './components/live/PreacherDisplay';
import OutputRouter from './components/live/OutputRouter';
import StageDisplay from './components/live/StageDisplay';
import StageDisplayMusicos from './components/live/StageDisplayMusicos';
import MultimediaHub from './components/live/MultimediaHub';
import AdminLayout from './components/layout/AdminLayout';
import AdminDashboard from './components/admin/AdminDashboard';
import Login from './components/layout/Login';
import MediaCenter from './components/admin/MediaCenter';
import PreachingManagement from './components/admin/PreachingManagement';
import AddSongAI from './components/admin/AddSongAI';
import SongList from './components/admin/SongList';
import EditSong from './components/admin/EditSong';
import UserManagement from './components/admin/UserManagement';
import TeamPinGate from './components/admin/TeamPinGate';
import EventManagement from './components/admin/EventManagement';
import SetlistViewer from './components/admin/SetlistViewer';
import UserProfile from './components/admin/UserProfile';
import { getAuth, onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot, updateDoc } from 'firebase/firestore';
import { getToken, onMessage } from 'firebase/messaging';
import { db, messaging } from './config/firebase';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { App as CapacitorApp } from '@capacitor/app';
import { ACCOUNT_STATUSES, getAccountStatusLabel, isAccountAllowed, normalizeAccountStatus } from './utils/accountStatus';
import { canAccessMediaLibrary } from './utils/mediaLibraryPermissions';
import { canAccessController, canAccessMultimediaTools, canAccessPreachings, canManageSongs, canManageTeam, canViewEventsAndSetlists } from './utils/rolePermissions';
import { clearTeamPinAccessState } from './utils/teamPinAccess';
import { FeedbackProvider, notifyFeedback } from './components/ui/FeedbackProvider';

const AccountBlockedScreen = ({ user }) => {
  const status = normalizeAccountStatus(user?.accountStatus);
  const suspensión = user?.suspensión || {};
  const title = status === ACCOUNT_STATUSES.DISABLED ? 'Cuenta desactivada' : 'Cuenta suspendida';
  const startedAt = suspensión.startedAt ? new Date(suspensión.startedAt).toLocaleString() : 'Sin fecha registrada';
  const endsAt = suspensión.endsAt ? new Date(suspensión.endsAt).toLocaleDateString() : null;
  const handleLogout = async () => {
    clearTeamPinAccessState();
    await signOut(getAuth());
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-6">
      <div className="w-full max-w-xl rounded-[2rem] border border-amber-500/20 bg-zinc-900/80 p-8 shadow-2xl shadow-black/40 text-center">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-3xl border border-amber-500/25 bg-amber-500/10 text-amber-200">
          <span className="text-2xl font-black">!</span>
        </div>
        <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-300">{getAccountStatusLabel(status)}</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight">{title}</h1>
        <p className="mt-3 text-sm leading-relaxed text-zinc-400">
          Tu acceso a Kadosh esta temporalmente restringido. Contacta al administrador del ministerio para mas informacion.
        </p>

        <div className="mt-6 space-y-3 rounded-3xl border border-white/10 bg-black/25 p-4 text-left">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Motivo</p>
            <p className="mt-1 text-sm font-semibold text-zinc-100">{suspensión.reason || 'No especificado'}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Fecha de inicio</p>
              <p className="mt-1 text-sm font-semibold text-zinc-100">{startedAt}</p>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Fecha de finalización</p>
              <p className="mt-1 text-sm font-semibold text-zinc-100">{endsAt || 'Indefinida'}</p>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="mt-6 rounded-2xl border border-white/10 bg-zinc-950 px-5 py-3 text-xs font-black uppercase tracking-wide text-zinc-300 hover:bg-zinc-800 hover:text-white"
        >
          Cerrar sesion
        </button>
      </div>
    </div>
  );
};

const UnauthorizedScreen = ({ title = 'Sin autorizacion', message = 'Tu rol actual no tiene permiso para abrir esta sección.' }) => (
  <div className="min-h-[55vh] flex items-center justify-center p-6">
    <div className="kp-card w-full max-w-lg rounded-3xl p-8 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-red-500/20 bg-red-500/10 text-red-300">
        <span className="text-2xl font-black">!</span>
      </div>
      <p className="text-xs font-black uppercase tracking-[0.24em] text-red-300">Acceso restringido</p>
      <h1 className="mt-2 text-2xl font-black text-white">{title}</h1>
      <p className="mt-3 text-sm font-semibold leading-relaxed text-zinc-400">{message}</p>
    </div>
  </div>
);

const ProtectedAdminRoute = ({ user, allowed, children, message }) => (
  <AdminLayout user={user}>
    {allowed ? children : <UnauthorizedScreen message={message} />}
  </AdminLayout>
);

const ProtectedLiveRoute = ({ allowed, children, message }) => (
  allowed ? children : (
    <div className="min-h-screen bg-zinc-950 text-white">
      <UnauthorizedScreen message={message} />
    </div>
  )
);

function App() {
  const [user, setUser] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const userAccessRef = useRef(true);
  const notificationsStartedRef = useRef(false);

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
            importance: 5, // Prioridad M?xima
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
              console.log('Token registrado con ?xito');
            });

            PushNotifications.addListener('pushNotificationReceived', (notification) => {
              // Esto hace que vibre y suene si la App est? abierta
              console.log('Notificación recibida:', notification);
            });

            PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
              // Esto hace que al tocar la notificación te lleve a la secci?n correcta
              const data = notification.notification.data;
              if (data && data.url) window.location.href = data.url;
            });

             await PushNotifications.register();
          } else {
            notifyFeedback("No has permitido las notificaciones. No recibirás avisos del setlist.", { type: 'warning' });
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
              if (!userAccessRef.current) return;
              notifyFeedback(payload.notification.body, { title: payload.notification.title, type: 'info', duration: 7000 });
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

        let initialUserData = docSnap.exists() ? docSnap.data() : null;

        if (!docSnap.exists()) {
          const esElDueno = firebaseUser.email === import.meta.env.VITE_OWNER_EMAIL;
          const userData = { email: firebaseUser.email, nombre: esElDueno ? 'Dueño Principal' : 'Usuario Nuevo', rol: esElDueno ? 'dueño' : 'musico', fechaCreacion: new Date().toISOString() };
          userData.accountStatus = 'active';
          await setDoc(docRef, userData);
          initialUserData = userData;
        }

        // Disparamos la l?gica de notificaciones inmediatamente
        userAccessRef.current = isAccountAllowed(initialUserData?.accountStatus);
        if (userAccessRef.current && !notificationsStartedRef.current) {
          notificationsStartedRef.current = true;
          inicializarNotificaciones(firebaseUser.uid);
        }

        // Escuchamos los cambios del perfil en TIEMPO REAL
        unsubscribeSnapshot = onSnapshot(docRef, (snap) => {
          if (snap.exists()) {
            const userData = snap.data();
            const normalizedStatus = normalizeAccountStatus(userData.accountStatus);
            const wasAllowed = userAccessRef.current;
            userAccessRef.current = isAccountAllowed(normalizedStatus);
            if (!userAccessRef.current) {
              notificationsStartedRef.current = false;
              if (Capacitor.isNativePlatform()) {
                PushNotifications.removeAllListeners().catch(() => {});
              }
            }
            if (!wasAllowed && userAccessRef.current && !notificationsStartedRef.current) {
              notificationsStartedRef.current = true;
              inicializarNotificaciones(firebaseUser.uid);
            }
            // Migraci?n silenciosa: Si un usuario antiguo tiene guardado el viejo tamaño 24, lo forzamos a 16
            if (userData.preferencias?.fontSize === 24) {
              updateDoc(docRef, { 'preferencias.fontSize': 16 }).catch(e => console.error(e));
              userData.preferencias.fontSize = 16;
            }
            setUser({ uid: firebaseUser.uid, email: firebaseUser.email, accountStatus: normalizedStatus, ...userData });
          }
          setLoadingAuth(false);
        });

      } else {
        clearTeamPinAccessState();
        setUser(null);
        userAccessRef.current = true;
        notificationsStartedRef.current = false;
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
    return (
      <FeedbackProvider>
        <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-500 font-bold animate-pulse">Cargando Kadosh App...</div>
      </FeedbackProvider>
    );
  }

  if (!user) {
    return (
      <FeedbackProvider>
        <Login />
      </FeedbackProvider>
    );
  }

  if (!isAccountAllowed(user.accountStatus)) {
    return (
      <FeedbackProvider>
        <AccountBlockedScreen user={user} />
      </FeedbackProvider>
    );
  }

  return (
    <FeedbackProvider>
      <Router>
        <Routes>
        {/* Rutas de Administración (Envueltas en el Layout) */}
        <Route path="/" element={<AdminLayout user={user}><AdminDashboard user={user} /></AdminLayout>} />
        <Route path="/canciones" element={<AdminLayout user={user}><SongList user={user} /></AdminLayout>} />
        <Route path="/añadir" element={<ProtectedAdminRoute user={user} allowed={canManageSongs(user)} message="Solo el equipo autorizado puede agregar canciones."><AddSongAI user={user} /></ProtectedAdminRoute>} />
        <Route path="/editar/:id" element={<ProtectedAdminRoute user={user} allowed={canManageSongs(user)} message="Solo el equipo autorizado puede editar canciones."><EditSong user={user} /></ProtectedAdminRoute>} />
        <Route path="/equipo" element={<ProtectedAdminRoute user={user} allowed={canManageTeam(user)} message="Solo el dueno puede gestionar integrantes y roles."><TeamPinGate user={user}><UserManagement user={user} /></TeamPinGate></ProtectedAdminRoute>} />
        <Route path="/eventos" element={<ProtectedAdminRoute user={user} allowed={canViewEventsAndSetlists(user)} message="Tu rol no tiene acceso a Eventos y Setlists."><EventManagement user={user} /></ProtectedAdminRoute>} />
        <Route path="/predicas" element={<ProtectedAdminRoute user={user} allowed={canAccessPreachings(user)} message="Tu rol no tiene acceso al módulo de Predicas."><PreachingManagement user={user} /></ProtectedAdminRoute>} />
        <Route path="/biblioteca-multimedia" element={<ProtectedAdminRoute user={user} allowed={canAccessMediaLibrary(user)} message="La Biblioteca Multimedia esta disponible para dueno, administradores y multimedia."><MediaCenter user={user} /></ProtectedAdminRoute>} />
        <Route path="/multimedia-hub" element={<ProtectedAdminRoute user={user} allowed={canAccessMultimediaTools(user)} message="Central Multimedia esta disponible para dueno, administradores y multimedia."><MultimediaHub user={user} /></ProtectedAdminRoute>} />
        <Route path="/setlist/:id" element={<ProtectedAdminRoute user={user} allowed={canViewEventsAndSetlists(user)} message="Tu rol no tiene acceso a este setlist."><SetlistViewer user={user} /></ProtectedAdminRoute>} />
        <Route path="/perfil" element={<AdminLayout user={user}><UserProfile user={user} /></AdminLayout>} />
        
        {/* Ruta del Modo Culto (Pantalla Completa, SIN Layout) */}
        <Route path="/live/:id" element={
          <LiveModeUI user={user} esGuitarrista={true} preferences={userPreferences} />
        } />
        
        {/* Ruta Pública del Proyector para la Congregación */}
        <Route path="/proyector/:eventoId" element={<Proyector />} />
        <Route path="/predicador/:eventoId" element={<PreacherDisplay user={user} />} />
        <Route path="/output/:eventoId/:outputId" element={<OutputRouter user={user} />} />
        
        {/* Ruta Privada de Retorno para los Másicos en Tarima */}
        <Route path="/retorno/:eventoId" element={<StageDisplay />} />
        <Route path="/retorno-musicos/:eventoId" element={<StageDisplayMusicos user={user} />} />
        
        {/* Ruta del Controlador Multimedia */}
        <Route path="/control-proyector/:eventoId" element={<ProtectedLiveRoute allowed={canAccessController(user)} message="Solo el equipo multimedia autorizado puede abrir el controlador."><ProyectorController user={user} /></ProtectedLiveRoute>} />
        </Routes>
      </Router>
    </FeedbackProvider>
  );
}

export default App;

