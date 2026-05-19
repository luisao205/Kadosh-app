import React, { useState, useEffect } from 'react';
import { Home, Music, Calendar, Settings, Menu, X, PlayCircle, LogOut, User, BellRing, Bell } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { getAuth, signOut } from 'firebase/auth';
import { collection, query, where, onSnapshot, orderBy, limit } from 'firebase/firestore';
import { db } from '../../config/firebase';

const AdminLayout = ({ children, user }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [toastNotif, setToastNotif] = useState(null); // { titulo, mensaje }
  const [sysNotifs, setSysNotifs] = useState([]); // Historial de notificaciones
  const [showNotifs, setShowNotifs] = useState(false); // Panel de notificaciones
  const [unreadNotifs, setUnreadNotifs] = useState(0); // Contador rojo
  const location = useLocation();
  const navigate = useNavigate();

  const navItems = [
    { name: 'Dashboard', path: '/', icon: <Home size={20} /> },
    { name: 'Repertorio', path: '/canciones', icon: <Music size={20} /> },
    { name: 'Eventos', path: '/eventos', icon: <Calendar size={20} /> },
    { name: 'Mi Perfil', path: '/perfil', icon: <User size={20} /> },
  ];

  const handleLogout = async () => {
    try {
      const auth = getAuth();
      await signOut(auth);
    } catch (error) {
      console.error("Error al cerrar sesión:", error);
    }
  };

  // Escuchador de Notificaciones en Tiempo Real
  useEffect(() => {
    if (!user?.uid) return;

    // 1. Pedir permiso para notificaciones nativas del navegador/móvil
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    // Controladores independientes de carga inicial para no cruzar datos
    let isInitialLoadEventos = true;
    let isInitialLoadNotifs = true;

    // Formato YYYY-MM-DD para evitar errores de zona horaria y no perder eventos de hoy
    const tzoffset = (new Date()).getTimezoneOffset() * 60000;
    const hoy = (new Date(Date.now() - tzoffset)).toISOString().slice(0, 10);

    const playNotificationSound = () => {
      try {
        const audio = new Audio('https://actions.google.com/sounds/v1/alarms/beep_short.ogg');
        audio.volume = 0.5;
        audio.play().catch(() => {}); // Ignorar si el navegador bloquea el auto-play
      } catch (e) {}
    };

    // 1. Escuchar Eventos (RSVP Convocatorias)
    const qEventos = query(collection(db, 'eventos'), where('fecha', '>=', hoy));
    const unsubEventos = onSnapshot(qEventos, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        const evento = change.doc.data();
        const eventId = change.doc.id;
        
        // Si detecta que fuiste convocado y aún no has respondido
        if (evento.estadoAsistencia && evento.estadoAsistencia[user.uid] === 'pendiente') {
          const notifKey = `notif_${eventId}_${user.uid}`;
          // Comprobamos si ya te habíamos avisado de esto para no spamearte
          if (!localStorage.getItem(notifKey)) {
            localStorage.setItem(notifKey, 'true');
            
            // Agregar la convocatoria directamente al historial de la campanita
            setSysNotifs(prev => {
              const combined = [{ id: notifKey, titulo: 'NUEVA CONVOCATORIA', mensaje: `Has sido convocado para: ${evento.titulo}. Ve al panel para confirmar.`, fechaCreacion: new Date().toISOString() }, ...prev];
              const unique = Array.from(new Map(combined.map(item => [item.id, item])).values());
              return unique.sort((a, b) => new Date(b.fechaCreacion) - new Date(a.fechaCreacion)).slice(0, 15);
            });

            // Solo disparamos la alerta visual si la app ya estaba abierta (no en la carga inicial)
            if (!isInitialLoadEventos) {
              if ('Notification' in window && Notification.permission === 'granted') {
                new Notification('¡Kadosh App - Nueva Convocatoria!', { body: `Has sido convocado para: ${evento.titulo}`, icon: '/KADOSH_APP.jpg' });
              }
              playNotificationSound();
              setToastNotif({ titulo: 'Nueva Convocatoria', mensaje: `Fuiste convocado a: ${evento.titulo}`, url: `/setlist/${eventId}` });
              setTimeout(() => setToastNotif(null), 6000);
              setUnreadNotifs(prev => prev + 1);
            }
          }
        }
      });
      isInitialLoadEventos = false;
    });

    // 2. Escuchar Notificaciones del Sistema (Historial general)
    const qNotif = query(collection(db, 'notificaciones'), orderBy('fechaCreacion', 'desc'), limit(30));
    
    const unsubNotif = onSnapshot(qNotif, (snapshot) => {
      let newNotifs = [];
      // Limpieza de 8 días en frontend (fallback hasta que activen TTL en Firebase)
      const eightDaysAgoMs = Date.now() - (8 * 24 * 60 * 60 * 1000);

      snapshot.docChanges().forEach((change) => {
        const notif = change.doc.data();
        const notifId = change.doc.id;
        
        const dest = notif.destinatarios || [];
        const excluidos = notif.excluidos || [];
        
        if (excluidos.includes(user.uid)) return; // Ignorar si estoy excluido de la sorpresa
        const isForMe = dest.includes('all') || dest.includes(user.uid) || dest.includes(user.rol) || (user.instrumentos && user.instrumentos.some(i => dest.includes(i)));
          
        if (isForMe) {
          if (change.type === 'added') {
            if (new Date(notif.fechaCreacion).getTime() < eightDaysAgoMs) return; // Ignorar viejas

            newNotifs.push({ id: notifId, ...notif });
            
          const notifKey = `sysnotif_${notifId}_${user.uid}`;
          if (!localStorage.getItem(notifKey)) {
            localStorage.setItem(notifKey, 'true');
            
            if (!isInitialLoadNotifs) {
              // No auto-notificarme de mis propias acciones
              if (notif.emisorId !== user.uid) {
                if ('Notification' in window && Notification.permission === 'granted') {
                  new Notification(notif.titulo, { body: notif.mensaje, icon: '/KADOSH_APP.jpg' });
                }
                playNotificationSound();
                setToastNotif({ titulo: notif.titulo, mensaje: notif.mensaje, url: notif.url });
                setTimeout(() => setToastNotif(null), 6000);
                setUnreadNotifs(prev => prev + 1); // Subimos el contador de la campanita
              }
            }
          }
        }
        }
      });
      if (newNotifs.length > 0) {
        setSysNotifs(prev => {
          const combined = [...newNotifs, ...prev];
          const unique = Array.from(new Map(combined.map(item => [item.id, item])).values());
          return unique.sort((a, b) => new Date(b.fechaCreacion) - new Date(a.fechaCreacion)).slice(0, 15);
        });
      }
      isInitialLoadNotifs = false;
    });

    return () => {
      unsubEventos();
      unsubNotif();
    };
  }, [user?.uid]);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex text-zinc-900 dark:text-zinc-100 transition-colors duration-300">
      {/* Fondo oscuro para móvil cuando el menú está abierto */}
      {isOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={() => setIsOpen(false)} />
      )}

      {/* Alerta Global Flotante (Toast) */}
      {toastNotif && (
        <div 
          onClick={() => { if(toastNotif.url) { navigate(toastNotif.url); setToastNotif(null); } }}
          className={`fixed top-6 right-6 z-[100] bg-gradient-to-r from-blue-600 to-violet-600 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-4 animate-in slide-in-from-top-5 ${toastNotif.url ? 'cursor-pointer hover:scale-105 transition-transform' : ''}`}
        >
          <div className="p-2 bg-white/20 rounded-full"><BellRing size={24} className="animate-bounce" /></div>
          <div>
            <p className="text-[10px] text-blue-200 font-bold uppercase tracking-widest mb-0.5">{toastNotif.titulo}</p>
            <p className="font-bold text-sm leading-tight">{toastNotif.mensaje}</p>
          </div>
        </div>
      )}

      {/* Panel de Notificaciones (Flotante) */}
      {showNotifs && (
        <div className="fixed top-16 right-4 md:left-64 md:top-16 md:right-auto md:ml-4 w-80 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
          <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center bg-zinc-50 dark:bg-zinc-800/50">
            <h3 className="font-bold text-zinc-900 dark:text-zinc-100">Notificaciones</h3>
            <button onClick={() => setShowNotifs(false)} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"><X size={16}/></button>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {sysNotifs.length === 0 ? (
              <p className="text-center text-sm text-zinc-500 py-6 font-medium">No hay notificaciones recientes.</p>
            ) : (
              sysNotifs.map(n => (
              <div key={n.id} 
                onClick={() => { if(n.url) { navigate(n.url); setShowNotifs(false); } }} 
                className={`p-4 border-b border-zinc-100 dark:border-zinc-800/50 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors ${n.url ? 'cursor-pointer' : ''}`}
              >
                  <p className="text-xs font-black text-blue-600 dark:text-blue-400 mb-1">{n.titulo}</p>
                  <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300 leading-tight">{n.mensaje}</p>
                  <p className="text-[10px] text-zinc-400 font-bold mt-2">{new Date(n.fechaCreacion).toLocaleTimeString('es-ES', {hour:'2-digit', minute:'2-digit'})}</p>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Barra Lateral (Sidebar) */}
      <aside className={`fixed inset-y-0 left-0 bg-white dark:bg-zinc-900 w-64 border-r border-zinc-200 dark:border-zinc-800 z-50 transform transition-transform duration-300 ease-in-out md:translate-x-0 md:static md:flex-shrink-0 shadow-lg md:shadow-none flex flex-col ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="h-16 flex items-center justify-between px-6 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-black bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-violet-600 tracking-tight">Kadosh</span>
            <span className="text-[10px] font-bold tracking-widest uppercase bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 px-2 py-0.5 rounded-md shadow-sm">App</span>
          </div>
          <div className="flex items-center gap-2">
            {/* Campanita Desktop */}
            <button className="hidden md:flex relative p-2 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors" onClick={() => {setShowNotifs(!showNotifs); setUnreadNotifs(0);}}>
              <Bell size={20} />
              {unreadNotifs > 0 && <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white dark:border-zinc-900"></span>}
            </button>
            <button className="md:hidden text-zinc-500 hover:text-zinc-800" onClick={() => setIsOpen(false)}>
              <X size={24} />
            </button>
          </div>
        </div>
        <nav className="p-4 space-y-2 flex-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.name}
                to={item.path}
                onClick={() => setIsOpen(false)}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium ${isActive ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 shadow-sm' : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 hover:text-zinc-900 dark:hover:text-zinc-100'}`}
              >
                {item.icon}
                {item.name}
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t border-zinc-200 dark:border-zinc-800">
          <button 
            onClick={handleLogout}
            className="flex items-center gap-3 px-4 py-3 w-full rounded-xl transition-all font-bold text-red-600 dark:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-700 dark:hover:text-red-400 active:scale-95"
          >
            <LogOut size={20} />
            Cerrar Sesión
          </button>
        </div>
      </aside>

      {/* Contenido Principal */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Cabecera Móvil (Hamburguesa) */}
        <header className="h-16 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between px-4 md:hidden shadow-sm transition-colors">
          <div className="flex items-center">
            <button onClick={() => setIsOpen(true)} className="text-zinc-600 dark:text-zinc-400 p-2 -ml-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg">
              <Menu size={24} />
            </button>
            <div className="ml-2 flex items-center gap-1.5">
              <span className="font-black text-zinc-800 dark:text-zinc-100 text-lg tracking-tight">Kadosh</span>
              <span className="text-[10px] font-bold uppercase text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">App</span>
            </div>
          </div>
          {/* Campanita Móvil */}
          <button className="relative p-2 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors" onClick={() => {setShowNotifs(!showNotifs); setUnreadNotifs(0);}}>
            <Bell size={22} />
            {unreadNotifs > 0 && <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white dark:border-zinc-900"></span>}
          </button>
        </header>
        
        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          {children}
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;