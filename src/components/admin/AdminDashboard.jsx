import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Calendar, Music, BarChart3, TrendingUp, Mic2, Bell, CheckCircle2, XCircle, Cake, Trash2, MessageCircle } from 'lucide-react';
import { collection, query, where, orderBy, limit, onSnapshot, getDoc, doc, getDocs, addDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { traducirAcorde } from '../../utils/musicCore';
import confetti from 'canvas-confetti';

const AdminDashboard = ({ user }) => {
  const navigate = useNavigate();

  const esMusico = user?.rol === 'musico';
  const esDueno = user?.rol === 'dueño';

  const [proximoEvento, setProximoEvento] = useState(null);
  const [cancionesEvento, setCancionesEvento] = useState([]);
  const [totalCanciones, setTotalCanciones] = useState(0);
  const [invitaciones, setInvitaciones] = useState([]);
  const [cumpleanos, setCumpleanos] = useState([]);
  const [stats, setStats] = useState({ topCanciones: [], topCantantes: [], totalEventos: 0 });
  const [isCleaning, setIsCleaning] = useState(false);
  const [cleanResult, setCleanResult] = useState(null);
  const confettiFired = useRef(false);
  const sentBirthdayNotifs = useRef(new Set());

  const notacion = user?.preferencias?.notacion || 'sharps';
  const formatoAcordes = user?.preferencias?.formatoAcordes || 'american';

  useEffect(() => {
    // 1. Obtener Rankings (Desde el documento pre-calculado de las 3 AM)
    const unsubStats = onSnapshot(doc(db, 'sistema', 'estadisticas'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setStats(prev => ({
          ...prev,
          topCanciones: data.topCanciones || [],
          topCantantes: data.topCantantes || [],
        }));
      } else {
        console.debug("Estadísticas: El documento 'sistema/estadisticas' se creará en el próximo ciclo nocturno.");
      }
    });

    // 2. Contadores en Tiempo Real (Escuchan las colecciones directamente)
    const unsubCancionesCount = onSnapshot(collection(db, 'canciones'), (snap) => setTotalCanciones(snap.size));
    const unsubEventosCount = onSnapshot(collection(db, 'eventos'), (snap) => setStats(prev => ({ ...prev, totalEventos: snap.size })));

    // Formato YYYY-MM-DD en hora local para no perder eventos programados para hoy más temprano
    const tzoffset = (new Date()).getTimezoneOffset() * 60000;
    const hoy = (new Date(Date.now() - tzoffset)).toISOString().slice(0, 10);

    // 2. Obtener el Próximo Evento (Fecha >= Hoy)
    const qEventos = query(
      collection(db, 'eventos'),
      where('fecha', '>=', hoy),
      orderBy('fecha', 'asc'),
      limit(10) // Aumentamos el límite para poder buscar el próximo NO completado
    );

    const unsubEventos = onSnapshot(qEventos, async (snap) => {
      if (!snap.empty) {
        const docs = snap.docs.map(d => ({id: d.id, ...d.data()}));
        const nextEv = docs.find(d => !d.completado); // Filtramos localmente los completados

        if (nextEv) {
          setProximoEvento(nextEv);
        // Cargar detalles de canciones para mostrar la lista rápida
        const cancionesIds = nextEv.setlist ? nextEv.setlist.filter(i => i.type === 'song').map(i => i.value) : (nextEv.canciones || []);
        const uniqueSongs = [...new Set(cancionesIds)];
        
        if (uniqueSongs.length > 0) {
          const cancionesPromises = uniqueSongs.map(id => getDoc(doc(db, 'canciones', id)));
          const cancionesSnaps = await Promise.all(cancionesPromises);
          setCancionesEvento(cancionesSnaps.map(s => ({ id: s.id, ...s.data() })));
        } else {
          setCancionesEvento([]);
        }
        } else {
          setProximoEvento(null);
          setCancionesEvento([]);
        }
      } else {
        setProximoEvento(null);
        setCancionesEvento([]);
      }
    });

    // 3. Buscar Invitaciones Pendientes (RSVP)
    let unsubInv = () => {};
    if (user?.uid) {
      const qInvitaciones = query(collection(db, 'eventos'), where('fecha', '>=', hoy));
      unsubInv = onSnapshot(qInvitaciones, (snap) => {
        const invs = [];
        snap.docs.forEach(doc => {
          const ev = doc.data();
          if (ev.estadoAsistencia && ev.estadoAsistencia[user.uid] === 'pendiente') invs.push({ id: doc.id, ...ev });
        });
        setInvitaciones(invs);
      });
    }

    // 4. Obtener Usuarios para calcular Cumpleaños
    const unsubUsuarios = onSnapshot(collection(db, 'usuarios'), (snap) => {
      const today = new Date();
      today.setHours(0,0,0,0);
      const currentYear = today.getFullYear();
      
      const lista = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(u => u.fechaNacimiento).map(u => {
        const [y, m, d] = u.fechaNacimiento.split('-');
        let bdayThisYear = new Date(today.getFullYear(), m - 1, d);
        let diffDays = Math.ceil((bdayThisYear.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        
        if (diffDays < -30) {
          bdayThisYear = new Date(today.getFullYear() + 1, m - 1, d);
          diffDays = Math.ceil((bdayThisYear.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        }

        const edadCumplida = bdayThisYear.getFullYear() - parseInt(y);

        // LÓGICA DE SORPRESAS DE CUMPLEAÑOS (Solo procesado por el admin principal)
        if ((esDueno || user?.rol === 'admin') && (diffDays === 7 || diffDays === 1 || diffDays === 0)) {
          const flagKey = `${bdayThisYear.getFullYear()}_${diffDays}d`;
          const sessionKey = `${u.id}_${flagKey}`;
          
          if (u.avisosCumpleanos !== flagKey && !sentBirthdayNotifs.current.has(sessionKey)) {
            sentBirthdayNotifs.current.add(sessionKey); // Bloqueamos el reenvío en esta sesión
            (async () => {
              try {
                await updateDoc(doc(db, 'usuarios', u.id), { avisosCumpleanos: flagKey });
                await addDoc(collection(db, 'notificaciones'), {
                  titulo: diffDays === 7 ? '🎂 Cumpleaños cercano' : diffDays === 1 ? '🤫 ¡Mañana hay Cumpleaños!' : '🎉 ¡Hoy es el cumpleaños!',
                  mensaje: diffDays === 7 
                    ? `Falta 1 semana para el cumpleaños de ${u.nombre.split(' ')[0]}. ¡Prepara el abrazo!` 
                    : diffDays === 1 
                      ? `¡Mañana es el cumpleaños de ${u.nombre.split(' ')[0]}! Sorprendámoslo(a) mañana.`
                      : `Hoy celebramos la vida de ${u.nombre.split(' ')[0]}. ¡No olvides felicitarlo(a)!`,
                  destinatarios: ['all'],
                  excluidos: [u.id], // 🚨 Magia: Excluye al cumpleañero
                  emisorId: 'system',
                  fechaCreacion: new Date().toISOString()
                });
              } catch (e) { 
                console.error(e); 
                sentBirthdayNotifs.current.delete(sessionKey); // Si falla, permitimos reintentar
              }
            })();
          }
        }

        return { ...u, diffDays, edad: edadCumplida };
      });
      
      // Orden personalizado: Hoy y Próximos primero, luego los Pasados recientes
      lista.sort((a, b) => {
        if (a.diffDays >= 0 && b.diffDays >= 0) return a.diffDays - b.diffDays; // Ascendente
        if (a.diffDays < 0 && b.diffDays < 0) return b.diffDays - a.diffDays; // Descendente (-1 antes que -2)
        if (a.diffDays >= 0 && b.diffDays < 0) return -1; // Positivos primero
        if (a.diffDays < 0 && b.diffDays >= 0) return 1;
        return 0;
      });
      setCumpleanos(lista); // Mostramos todos sin límite
      
      if (!confettiFired.current && lista.some(c => c.diffDays === 0)) {
        confettiFired.current = true;
        setTimeout(() => {
          confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 }, zIndex: 100 });
        }, 500);
      }
    });

    return () => { unsubStats(); 
      unsubCancionesCount(); 
      unsubEventosCount(); 
      unsubEventos(); 
      unsubInv(); 
      unsubUsuarios();  };
  }, []);

  const responderRSVP = async (eventoId, respuesta) => {
    try { 
      await updateDoc(doc(db, 'eventos', eventoId), { [`estadoAsistencia.${user.uid}`]: respuesta }); 

      let sugerenciaMsg = '';
      if (respuesta === 'rechazado') {
        const inv = invitaciones.find(i => i.id === eventoId);
        if (inv && inv.equipo) {
          const miItem = inv.equipo.find(item => (typeof item === 'string' ? item === user.uid : item.id === user.uid));
          const miRol = typeof miItem === 'string' ? (user.instrumentos && user.instrumentos[0]) : miItem?.rol;

          if (miRol) {
            const usuariosSnap = await getDocs(collection(db, 'usuarios'));
            const disponibles = [];
            usuariosSnap.forEach(usuarioDoc => {
              const u = usuarioDoc.data();
              if (usuarioDoc.id !== user.uid && !u.sinAcceso && u.instrumentos?.includes(miRol)) {
                const yaConvocado = inv.equipo.some(eq => (typeof eq === 'string' ? eq === usuarioDoc.id : eq.id === usuarioDoc.id));
                if (!yaConvocado) disponibles.push(u.nombre.split(' ')[0]);
              }
            });
            if (disponibles.length > 0) sugerenciaMsg = `\n💡 Tienes a ${disponibles.join(', ')} disponible(s) en ${miRol}.`;
            else sugerenciaMsg = `\n⚠️ No hay otros músicos registrados en ${miRol}.`;
          }
        }
      }

      // Notificar a los líderes
      await addDoc(collection(db, 'notificaciones'), {
        titulo: 'Respuesta de Convocatoria',
        mensaje: `${user.nombre} ha ${respuesta === 'confirmado' ? 'confirmado ✅' : 'rechazado ❌'} su asistencia.${sugerenciaMsg}`,
        destinatarios: ['admin', 'dueño'],
        emisorId: user.uid,
        url: `/setlist/${eventoId}`,
        fechaCreacion: new Date().toISOString()
      });
    } catch (error) { console.error(error); }
  };

  // Limpieza Automática de Base de Datos (Solo Dueño)
  const handleMantenimiento = async () => {
    if (!window.confirm("¿Seguro que deseas iniciar la limpieza de la base de datos? Se eliminarán notificaciones de más de 30 días y eventos completados de más de 90 días.")) return;
    
    setIsCleaning(true);
    try {
      let borradas = 0;
      let eventosBorrados = 0;
      const now = Date.now();
      
      // Limpiar notificaciones viejas
      const notifsSnap = await getDocs(collection(db, 'notificaciones'));
      for (const d of notifsSnap.docs) {
        const f = d.data().fechaCreacion;
        if (f && (now - new Date(f).getTime()) / (1000*60*60*24) > 30) { await deleteDoc(doc(db, 'notificaciones', d.id)); borradas++; }
      }
      
      // Limpiar Eventos completados viejos (> 90 días)
      const eventosSnap = await getDocs(collection(db, 'eventos'));
      for (const e of eventosSnap.docs) {
        const data = e.data();
        if (data.completado && data.fecha && (now - new Date(data.fecha).getTime()) / (1000*60*60*24) > 90) { 
          await deleteDoc(doc(db, 'eventos', e.id)); eventosBorrados++; 
        }
      }
      
      setCleanResult(`Limpieza exitosa: ${borradas} notificaciones y ${eventosBorrados} eventos eliminados.`);
      setTimeout(() => setCleanResult(null), 8000);
    } catch (e) { console.error(e); } finally { setIsCleaning(false); }
  };

  return (
    <div className="max-w-6xl mx-auto animate-in fade-in duration-500">
      <header className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-zinc-900 dark:text-white tracking-tight">
            ¡Hola, <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-violet-600 dark:from-blue-400 dark:to-violet-400">{user?.nombre?.split(' ')[0] || 'Usuario'}</span>! 👋
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400 mt-1 text-lg">Bienvenido al Panel de Control. Gestiona tu ministerio musical.</p>
        </div>
        {user?.fotoPerfil && (
          <img src={user.fotoPerfil} alt={user.nombre} className="w-14 h-14 rounded-full object-cover border-2 border-white dark:border-zinc-800 shadow-md hidden sm:block" />
        )}
      </header>

      {/* Alertas de RSVP */}
      {(invitaciones.length > 0 || cumpleanos.some(c => c.diffDays === 0)) && (
        <div className="mb-8 space-y-3">
          {/* Banner de Cumpleaños Propio */}
          {cumpleanos.find(c => c.id === user.uid && c.diffDays === 0) && (
            <div className="bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 p-6 rounded-3xl shadow-xl text-white text-center animate-bounce-subtle">
              <h2 className="text-2xl font-black mb-1">¡FELIZ CUMPLEAÑOS, {user.nombre.split(' ')[0].toUpperCase()}! 🎂</h2>
              <p className="text-white/90 font-medium">Toda la familia Kadosh celebra tu vida hoy. ¡Eres una gran bendición!</p>
            </div>
          )}

          {/* Banner de Otros Cumpleaños Hoy */}
          {cumpleanos.filter(c => c.id !== user.uid && c.diffDays === 0).map(c => (
            <div key={`bday-banner-${c.id}`} className="bg-gradient-to-r from-indigo-600 to-blue-500 p-4 sm:p-6 rounded-3xl shadow-lg text-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-in slide-in-from-top-4">
              <div className="flex items-start sm:items-center gap-3">
                <div className="p-2 bg-white/20 rounded-xl"><Cake size={24} className="text-white animate-pulse" /></div>
                <div>
                  <h3 className="font-black text-lg">¡Hoy es el cumpleaños de {c.nombre.split(' ')[0]}! 🎂</h3>
                  <p className="text-blue-100 text-sm font-medium">No olvides enviarle un mensaje y celebrar su vida.</p>
                </div>
              </div>
              <button onClick={() => window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(`¡Feliz cumpleaños ${c.nombre.split(' ')[0]}! 🎉 De parte de todo el equipo de Kadosh, te deseamos un día increíble y lleno de la bendición de Dios. ¡Te queremos!`)}`, '_blank')} className="w-full sm:w-auto px-4 py-2 bg-white text-blue-600 hover:bg-zinc-50 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-colors shadow-sm"><MessageCircle size={16}/> Felicitar</button>
            </div>
          ))}

          {invitaciones.map(inv => (
            <div key={inv.id} className="bg-gradient-to-r from-amber-500 to-orange-500 p-4 sm:p-6 rounded-3xl shadow-lg text-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-in slide-in-from-top-4">
              <div className="flex items-start sm:items-center gap-3">
                <div className="p-2 bg-white/20 rounded-xl"><Bell size={24} className="text-white animate-bounce" /></div>
                <div>
                  <h3 className="font-black text-lg">¡Has sido convocado!</h3>
                  <p className="text-amber-100 text-sm font-medium">Para el evento <b>{inv.titulo}</b> el {new Date(inv.fecha).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric' })}.</p>
                </div>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button onClick={() => responderRSVP(inv.id, 'rechazado')} className="flex-1 sm:flex-none px-4 py-2 bg-white/20 hover:bg-white/30 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-colors"><XCircle size={16}/> No podré</button>
                <button onClick={() => responderRSVP(inv.id, 'confirmado')} className="flex-1 sm:flex-none px-4 py-2 bg-white text-orange-600 hover:bg-zinc-50 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-colors shadow-sm"><CheckCircle2 size={16}/> Confirmar</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Tarjeta de Próximo Evento (Ocupa 2 columnas en PC) */}
        <div className="bg-white dark:bg-zinc-900 p-6 md:p-8 rounded-3xl shadow-sm border border-zinc-200 dark:border-zinc-800 lg:col-span-2 transition-colors">
          <h2 className="text-xl font-bold text-zinc-800 dark:text-zinc-100 mb-6">{proximoEvento ? `Próximo: ${proximoEvento.titulo}` : 'Próximos Eventos'}</h2>
          {proximoEvento ? (
            <>
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <span className="text-blue-600 dark:text-blue-400 font-bold bg-blue-50 dark:bg-blue-500/10 px-3 py-1 rounded-lg text-sm flex items-center gap-2">
                  <Calendar size={16} /> {new Date(proximoEvento.fecha).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
                </span>
                {proximoEvento.tipoEvento && (
                  <span className="text-violet-600 dark:text-violet-400 font-bold bg-violet-50 dark:bg-violet-500/10 px-3 py-1 rounded-lg text-sm">
                    {proximoEvento.tipoEvento}
                  </span>
                )}
              </div>
              <div className="space-y-3">
                {(() => {
                  const setlistItems = proximoEvento.setlist || (proximoEvento.canciones || []).map(id => ({ type: 'song', value: id }));
                  let songCounter = 1;
                  return setlistItems.filter(i => i.type === 'song').map((item, idx) => {
                    const cancion = cancionesEvento.find(c => c.id === item.value);
                    if (!cancion) return null;
                    const currentCount = songCounter++;
                    
                    let tonoFinal = cancion.tonoOriginal;
                    const cantanteAsignado = proximoEvento.cantantesPorCancion?.[cancion.id];
                    if (cantanteAsignado && cancion.tonosAlternativos) {
                      const opciones = cancion.tonosAlternativos.split(',');
                      const opcionMatch = opciones.find(opt => opt.trim().toLowerCase().startsWith(cantanteAsignado.toLowerCase() + ':'));
                      if (opcionMatch) tonoFinal = opcionMatch.split(':')[1].trim();
                    }
                    
                  return ( 
                  <div key={`${cancion.id}-${idx}`} onClick={() => {
                    navigate(`/setlist/${proximoEvento.id}`);
                  }} className="flex items-center justify-between p-4 bg-zinc-50/50 dark:bg-zinc-800/50 rounded-2xl border border-zinc-100 dark:border-zinc-700 hover:border-blue-200 dark:hover:border-blue-500/50 transition-colors cursor-pointer group">
                    <div>
                      <p className="font-bold text-zinc-800 dark:text-zinc-200 group-hover:text-blue-700 dark:group-hover:text-blue-400 transition-colors flex flex-wrap items-center gap-2">
                        {currentCount}. {cancion.titulo}
                        {proximoEvento.cantantesPorCancion?.[cancion.id] && <span className="text-[9px] font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10 px-1.5 py-0.5 rounded uppercase">{proximoEvento.cantantesPorCancion[cancion.id]}</span>}
                      </p>
                      <p className="text-sm text-zinc-500 dark:text-zinc-400 font-medium mt-0.5">Tono: {traducirAcorde(tonoFinal || 'C', formatoAcordes, notacion)} | {cancion.bpm} BPM</p>
                    </div>
                    <span className="px-3 py-1 bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 text-xs font-bold rounded-full flex items-center gap-1"><Calendar size={12}/> Ver Evento</span>
                  </div>
                    );
                  });
                })()}
                {(cancionesEvento.length === 0) && <p className="text-sm text-zinc-500 dark:text-zinc-400">No hay canciones agregadas a este evento.</p>}
              </div>
            </>
          ) : (
            <div className="text-center py-10 bg-zinc-50 dark:bg-zinc-800/30 rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800">
              <p className="text-zinc-500 dark:text-zinc-400 font-medium mb-2">No tienes eventos próximos programados.</p>
              {!esMusico && <button onClick={() => navigate('/eventos')} className="text-blue-600 dark:text-blue-400 font-bold text-sm hover:underline">Agendar evento</button>}
            </div>
          )}
        </div>

        {/* Tarjeta de Estadísticas Rápidas (Destacada) */}
        <div className="bg-gradient-to-br from-blue-600 to-violet-700 dark:from-blue-800 dark:to-violet-900 p-8 rounded-3xl shadow-lg text-white relative overflow-hidden transition-colors">
          <div className="absolute top-0 right-0 p-8 opacity-10">
            <svg className="w-24 h-24" fill="currentColor" viewBox="0 0 24 24"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>
          </div>
          <h2 className="text-lg font-bold mb-2 text-blue-100">Repertorio Activo</h2>
          <p className="text-5xl font-black mb-1">{totalCanciones}</p>
          <p className="text-blue-200 text-sm mb-8 font-medium">Canciones disponibles</p>
          
          {!esMusico && (
            <button 
              onClick={() => navigate('/añadir')}
              className="w-full bg-white text-blue-700 font-bold py-3 px-4 rounded-xl shadow-md hover:bg-blue-50 transition-colors active:scale-95"
            >
              + Añadir Canción
            </button>
          )}
        </div>

        {/* Tarjeta de Gestión de Equipo */}
        {esDueno && (
          <div className="bg-white dark:bg-zinc-900 p-6 md:p-8 rounded-3xl shadow-sm border border-zinc-200 dark:border-zinc-800 flex flex-col justify-center transition-colors">
            <h2 className="text-xl font-bold text-zinc-800 dark:text-zinc-100 mb-2 flex items-center gap-2">
              <Users size={24} className="text-indigo-600" /> Tu Equipo
            </h2>
            <p className="text-zinc-500 dark:text-zinc-400 text-sm font-medium mb-6">Administra los integrantes de la banda, sus accesos y roles en la aplicación.</p>
            
            <button 
              onClick={() => navigate('/equipo')}
              className="w-full mt-auto bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-bold py-3 px-4 rounded-xl shadow-md hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors flex items-center justify-center gap-2 active:scale-95"
            >
              Configurar Accesos
            </button>
          </div>
        )}
      </div>

      {/* NUEVA SECCIÓN: Estadísticas y Reportes */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in slide-in-from-bottom-5">
        
        {/* Top Canciones */}
        <div className="bg-white dark:bg-zinc-900 p-6 rounded-3xl shadow-sm border border-zinc-200 dark:border-zinc-800 transition-colors">
          <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-4 flex items-center gap-2">
            <TrendingUp size={20} className="text-blue-500" /> Top Canciones
          </h3>
          <div className="space-y-4">
            {stats.topCanciones.length > 0 ? stats.topCanciones.map((c, i) => (
              <div key={i} className="flex items-center justify-between group">
                <div className="flex items-center gap-3 overflow-hidden">
                  <span className="text-sm font-black text-zinc-300 dark:text-zinc-700 w-4 group-hover:text-blue-500 transition-colors">{i + 1}</span>
                  <span className="text-sm font-bold text-zinc-700 dark:text-zinc-300 truncate">{c.titulo}</span>
                </div>
                <span className="text-[10px] font-black bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 px-2 py-1 rounded-md tracking-wider">{c.count} VECES</span>
              </div>
            )) : <p className="text-sm text-zinc-500 dark:text-zinc-500">No hay datos suficientes.</p>}
          </div>
        </div>

        {/* Top Cantantes */}
        <div className="bg-white dark:bg-zinc-900 p-6 rounded-3xl shadow-sm border border-zinc-200 dark:border-zinc-800 transition-colors">
          <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-4 flex items-center gap-2">
            <Mic2 size={20} className="text-rose-500" /> Participación Vocal
          </h3>
          <div className="space-y-4">
            {stats.topCantantes.length > 0 ? stats.topCantantes.map((c, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className="w-7 h-7 rounded-full bg-rose-100 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center justify-center font-bold text-xs uppercase shrink-0">{c.nombre?.charAt(0) || '?'}</div>
                  <span className="text-sm font-bold text-zinc-700 dark:text-zinc-300 truncate">{c.nombre}</span>
                </div>
                <span className="text-[10px] font-black bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 px-2 py-1 rounded-md tracking-wider">{c.count} CANTOS</span>
              </div>
            )) : <p className="text-sm text-zinc-500 dark:text-zinc-500">No hay datos suficientes.</p>}
          </div>
        </div>

        {/* Resumen de Actividad */}
        <div className="bg-white dark:bg-zinc-900 p-6 rounded-3xl shadow-sm border border-zinc-200 dark:border-zinc-800 transition-colors flex flex-col justify-center">
          <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-4 flex items-center gap-2">
            <BarChart3 size={20} className="text-violet-500" /> Métricas Globales
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-zinc-50 dark:bg-zinc-800/50 p-4 rounded-2xl text-center border border-zinc-100 dark:border-zinc-800">
              <p className="text-4xl font-black text-zinc-900 dark:text-white mb-1">{stats.totalEventos}</p>
              <p className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Eventos</p>
            </div>
            <div className="bg-zinc-50 dark:bg-zinc-800/50 p-4 rounded-2xl text-center border border-zinc-100 dark:border-zinc-800">
              <p className="text-4xl font-black text-zinc-900 dark:text-white mb-1">{totalCanciones}</p>
              <p className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Canciones</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tarjeta de Cumpleaños */}
      <div className="mt-6 bg-white dark:bg-zinc-900 p-6 rounded-3xl shadow-sm border border-zinc-200 dark:border-zinc-800 transition-colors animate-in slide-in-from-bottom-5">
        <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-4 flex items-center gap-2">
          <Cake size={20} className="text-pink-500" /> Cumpleaños del Equipo
        </h3>
        <div className="space-y-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4">
          {cumpleanos.length > 0 ? cumpleanos.map((c, i) => (
            <div key={i} className="flex items-center justify-between p-3 rounded-2xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-800">
              <div className="flex items-center gap-3 overflow-hidden">
                {c.fotoPerfil ? (
                  <img src={c.fotoPerfil} className="w-10 h-10 rounded-full object-cover shrink-0 shadow-sm" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-pink-100 dark:bg-pink-500/20 text-pink-600 dark:text-pink-400 flex items-center justify-center font-bold text-sm uppercase shrink-0 shadow-sm">{c.nombre?.charAt(0) || '?'}</div>
                )}
                <div>
                  <p className="text-sm font-bold text-zinc-800 dark:text-zinc-200 truncate leading-none mb-1 flex items-center gap-1.5">
                    {c.nombre}
                    <span className="hidden sm:inline-block text-[10px] font-black bg-pink-100 dark:bg-pink-500/20 text-pink-600 dark:text-pink-400 px-1.5 py-0.5 rounded-md">{c.edad} AÑOS</span>
                  </p>
                  <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{new Date(0, parseInt(c.fechaNacimiento.split('-')[1])-1, parseInt(c.fechaNacimiento.split('-')[2])).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-[10px] font-black px-2.5 py-1 rounded-lg tracking-widest ${c.diffDays === 0 ? 'bg-pink-500 text-white animate-pulse shadow-md shadow-pink-500/30' : c.diffDays < 0 ? 'bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400' : 'bg-pink-100 dark:bg-pink-500/20 text-pink-700 dark:text-pink-300'}`}>
                  {c.diffDays === 0 ? '¡ES HOY!' : c.diffDays < 0 ? `HACE ${Math.abs(c.diffDays)} DÍAS` : `EN ${c.diffDays} DÍAS`}
                </span>
                <button onClick={() => window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(`¡Feliz cumpleaños ${c.nombre.split(' ')[0]}! 🎉 Que hoy sea un día de mucha alegría y paz para tu vida. ¡Un fuerte abrazo!`)}`, '_blank')} className="w-8 h-8 rounded-full bg-[#25D366]/10 text-[#25D366] flex items-center justify-center hover:bg-[#25D366] hover:text-white transition-colors" title="Felicitar por WhatsApp">
                  <MessageCircle size={14} />
                </button>
              </div>
            </div>
          )) : <p className="text-sm text-zinc-500 dark:text-zinc-500 col-span-full">No hay cumpleaños registrados. Ve a "Equipo" para añadirlos.</p>}
        </div>
      </div>

      {/* Modo Mantenimiento (Solo Dueño) */}
      {esDueno && (
        <div className="mt-6 bg-red-50 dark:bg-red-950/20 p-6 rounded-3xl border border-red-200 dark:border-red-900/50 flex flex-col md:flex-row justify-between items-center gap-4">
          <div>
            <h3 className="text-sm font-black text-red-700 dark:text-red-400 flex items-center gap-2 mb-1"><Trash2 size={16}/> Mantenimiento del Sistema</h3>
            <p className="text-xs font-medium text-red-600/80 dark:text-red-400/80">Limpia datos antiguos para que tu app siempre corra a máxima velocidad.</p>
          </div>
          <div className="flex items-center gap-3">
            {cleanResult && <span className="text-xs font-bold text-red-600 bg-red-100 px-3 py-2 rounded-lg">{cleanResult}</span>}
            <button onClick={handleMantenimiento} disabled={isCleaning} className="bg-red-600 hover:bg-red-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl transition-colors shadow-sm disabled:opacity-50">{isCleaning ? 'Limpiando...' : 'Iniciar Limpieza'}</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;