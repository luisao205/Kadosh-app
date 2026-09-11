import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Calendar, Bell, CheckCircle2, XCircle, Cake, Trash2, MessageCircle, PlayCircle, MapPin, Clock, UserRound, Users, ListMusic, Image as ImageIcon, AlertTriangle, Music, Monitor, Tv, Headphones, Mic2, ChevronDown, ChevronUp } from 'lucide-react';
import { collection, query, where, orderBy, limit, onSnapshot, getDoc, doc, getDocs, addDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { traducirAcorde } from '../../utils/musicCore';
import { canAccessController, canAccessMultimediaTools, canViewEventsAndSetlists, normalizeRole } from '../../utils/rolePermissions';
import confetti from 'canvas-confetti';
import { useFeedback } from '../ui/FeedbackProvider';

const AdminDashboard = ({ user }) => {
  const navigate = useNavigate();
  const { confirm: askConfirm } = useFeedback();

  const esMusico = user?.rol === 'musico';
  const esDueno = normalizeRole(user?.rol || user?.role) === 'dueno';

  const [proximoEvento, setProximoEvento] = useState(null);
  const [eventosProximos, setEventosProximos] = useState([]);
  const [cancionesEvento, setCancionesEvento] = useState([]);
  const [invitaciones, setInvitaciones] = useState([]);
  const [cumpleanos, setCumpleanos] = useState([]);
  const [isCleaning, setIsCleaning] = useState(false);
  const [cleanResult, setCleanResult] = useState(null);
  const [showEventDetails, setShowEventDetails] = useState(false);
  const [expandedDashboardEvents, setExpandedDashboardEvents] = useState({});
  const [outputMenu, setOutputMenu] = useState(null);
  const [isMobileOutputMenu, setIsMobileOutputMenu] = useState(false);
  const confettiFired = useRef(false);
  const sentBirthdayNotifs = useRef(new Set());

  const notacion = user?.preferencias?.notacion || 'sharps';
  const formatoAcordes = user?.preferencias?.formatoAcordes || 'american';

  useEffect(() => {
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
        const activeEvents = docs.filter(d => !d.completado);
        setEventosProximos(activeEvents);
        const nextEv = activeEvents[0]; // Filtramos localmente los completados

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
        setEventosProximos([]);
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

        // Lógica de sorpresas de cumpleaños (solo procesado por el admin principal)
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

    return () => {
      unsubEventos();
      unsubInv();
      unsubUsuarios();
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const mediaQuery = window.matchMedia('(max-width: 639px)');
    const updateMobileState = () => setIsMobileOutputMenu(mediaQuery.matches);
    updateMobileState();
    mediaQuery.addEventListener?.('change', updateMobileState);
    return () => mediaQuery.removeEventListener?.('change', updateMobileState);
  }, []);

  useEffect(() => {
    if (!outputMenu || !isMobileOutputMenu) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [outputMenu, isMobileOutputMenu]);

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
            else sugerenciaMsg = `\nNo hay otros músicos registrados en ${miRol}.`;
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

  // Limpieza automatica de base de datos (solo dueño)
  const handleMantenimiento = async () => {
    const shouldClean = await askConfirm({
      title: 'Iniciar limpieza',
      message: 'Se eliminarán notificaciones de más de 30 días y eventos completados de más de 90 días. ¿Deseas continuar?',
      confirmLabel: 'Iniciar limpieza',
      cancelLabel: 'Cancelar',
      variant: 'danger',
    });
    if (!shouldClean) return;
    
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

  const hasSectionMedia = (song) => (
    song?.sectionMedia
    && typeof song.sectionMedia === 'object'
    && Object.values(song.sectionMedia).some(items => Array.isArray(items) && items.length > 0)
  );

  const hasSongMedia = (song) => Boolean(song?.fondoUrl)
    || (Array.isArray(song?.recursos) && song.recursos.length > 0)
    || hasSectionMedia(song);

  const getSetlistItemsForEvent = (event) => (
    event?.setlist || (event?.canciones || []).map(id => ({ type: 'song', value: id }))
  );

  const getSongItemsForEvent = (event) => getSetlistItemsForEvent(event).filter(item => item?.type === 'song');

  const getSetlistItems = () => getSetlistItemsForEvent(proximoEvento);

  const getSongItems = () => getSongItemsForEvent(proximoEvento);

  const getEventDateForEvent = (event) => {
    if (!event?.fecha) return null;
    const parsed = new Date(event.fecha);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  const getEventDate = () => getEventDateForEvent(proximoEvento);

  const getEventTimeLabelForEvent = (event) => {
    const date = getEventDateForEvent(event);
    if (!date) return event?.hora || event?.horaInicio || 'Hora sin definir';
    return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  };

  const getEventTimeLabel = () => getEventTimeLabelForEvent(proximoEvento);

  const getPredicadorName = () => {
    if (!proximoEvento) return '';
    const predicadorUid = proximoEvento.predicadorId || proximoEvento.responsables?.Predicacion || proximoEvento.predicadorAsignado;
    const predicadorUsuario = predicadorUid ? cumpleanos.find(u => u.id === predicadorUid) : null;
    return predicadorUsuario?.nombre
      || proximoEvento.predicador
      || proximoEvento.preacher
      || proximoEvento.predicadorNombre
      || proximoEvento.preacherName
      || (predicadorUid ? 'Predicador asignado' : '');
  };

  const getEnsayoSummary = () => {
    const songItems = getSongItems();
    const checklist = proximoEvento?.ensayoChecklist || {};
    const readyCount = songItems.filter(item => {
      const check = checklist[item.idLocal] || checklist[item.value] || {};
      return check.repasada && check.tonoConfirmado && check.entradaDefinida && check.finalDefinido;
    }).length;

    return {
      total: songItems.length,
      readyCount,
      hasDate: Boolean(proximoEvento?.fechaEnsayo || proximoEvento?.ensayoFecha || proximoEvento?.ensayo),
    };
  };

  const getPreparationChecklist = () => {
    if (!proximoEvento) return [];

    const songItems = getSongItems();
    const equipo = Array.isArray(proximoEvento.equipo) ? proximoEvento.equipo : [];
    const asistencia = proximoEvento.estadoAsistencia || {};
    const confirmados = Object.values(asistencia).filter(value => value === 'confirmado').length;
    const respuestasPendientes = Object.values(asistencia).filter(value => value === 'pendiente').length;
    const cancionesConMedia = cancionesEvento.filter(hasSongMedia).length;
    const cancionesSinMedia = cancionesEvento.filter(song => !hasSongMedia(song)).length;
    const predicador = getPredicadorName();
    const ensayo = getEnsayoSummary();

    return [
      {
        label: 'Setlist',
        detail: songItems.length > 0 ? `${songItems.length} canciones` : 'Sin canciones agregadas',
        status: songItems.length > 0 ? 'ready' : 'incomplete'
      },
      {
        label: 'Multimedia',
        detail: cancionesEvento.length === 0
          ? 'Sin canciones para revisar'
          : cancionesSinMedia > 0
            ? `${cancionesSinMedia} canciones sin recursos`
            : `${cancionesConMedia} canciones preparadas`,
        status: cancionesEvento.length === 0 ? 'incomplete' : cancionesSinMedia > 0 ? 'attention' : 'ready'
      },
      {
        label: 'Predicador',
        detail: predicador || 'No asignado',
        status: predicador ? 'ready' : 'attention'
      },
      {
        label: 'Equipo',
        detail: equipo.length > 0
          ? `${confirmados}/${equipo.length} confirmados${respuestasPendientes > 0 ? `, ${respuestasPendientes} pendientes` : ''}`
          : 'Sin equipo convocado',
        status: equipo.length === 0 ? 'attention' : respuestasPendientes > 0 ? 'attention' : 'ready'
      },
      {
        label: 'Ensayo',
        detail: ensayo.total > 0
          ? `${ensayo.readyCount}/${ensayo.total} canciones listas${ensayo.hasDate ? '' : ' - sin fecha'}`
          : 'Sin setlist para ensayo',
        status: ensayo.total === 0 ? 'incomplete' : ensayo.readyCount === ensayo.total && ensayo.hasDate ? 'ready' : 'attention'
      },
      {
        label: 'Pantallas',
        detail: 'Revisión manual en Central Multimedia',
        status: 'neutral'
      }
    ];
  };

  const preparationChecklist = getPreparationChecklist();
  const operationalAlerts = preparationChecklist
    .filter(item => item.status !== 'ready' && item.status !== 'neutral')
    .map(item => {
      if (item.label === 'Setlist') return 'El próximo culto todavía no tiene setlist asignado.';
      if (item.label === 'Multimedia') return 'Hay canciones sin fondo o recursos multimedia.';
      if (item.label === 'Predicador') return 'No hay predicador asignado.';
      if (item.label === 'Equipo') return item.detail === 'Sin equipo convocado' ? 'No hay equipo convocado.' : 'Hay respuestas pendientes del equipo.';
      if (item.label === 'Ensayo') return item.detail.includes('sin fecha') ? 'Evento sin ensayo definido.' : 'El checklist de ensayo está incompleto.';
      if (item.label === 'Pantallas') return 'Revisa pantallas y salidas antes de iniciar.';
      return item.detail;
    });
  const actionablePreparationChecklist = preparationChecklist.filter(item => item.status !== 'neutral');
  const generalPreparationStatus = actionablePreparationChecklist.some(item => item.status === 'incomplete')
    ? 'Incompleto'
    : actionablePreparationChecklist.some(item => item.status === 'attention')
      ? 'En preparación'
      : 'Listo';
  const nextSongItems = getSongItems();
  const confirmedTeamCount = Object.values(proximoEvento?.estadoAsistencia || {}).filter(value => value === 'confirmado').length;
  const teamCount = Array.isArray(proximoEvento?.equipo) ? proximoEvento.equipo.length : 0;
  const songsWithMediaCount = cancionesEvento.filter(hasSongMedia).length;
  const pendingCount = actionablePreparationChecklist.filter(item => item.status !== 'ready').length;
  const userRole = normalizeRole(user?.rol || user?.role);
  const userInstruments = Array.isArray(user?.instrumentos) ? user.instrumentos.map(inst => normalizeRole(inst)) : [];
  const isSingerUser = ['cantante', 'vocalista'].includes(userRole)
    || userInstruments.some(inst => ['voz principal', 'coros', 'vocalista', 'cantante'].includes(inst));
  const isMusicianUser = userRole === 'musico' || userInstruments.length > 0;
  const canOpenSetlist = canViewEventsAndSetlists(user);
  const canOpenController = canAccessController(user);
  const canOpenCentral = canAccessMultimediaTools(user);
  const isLargeViewport = () => typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches;
  const openOutputScreen = (path) => {
    if (isLargeViewport()) {
      window.open(path, '_blank', 'noopener,noreferrer');
      return;
    }
    navigate(path);
  };
  const openOutputMenu = (action, eventId, trigger) => {
    const rect = trigger?.currentTarget?.getBoundingClientRect?.();
    setOutputMenu({
      eventId,
      options: action.outputOptions || [],
      anchorRect: rect ? {
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        left: rect.left,
        width: rect.width,
      } : null,
    });
  };
  const closeOutputMenu = () => setOutputMenu(null);
  const chooseOutputOption = (path) => {
    closeOutputMenu();
    openOutputScreen(path);
  };
  const getFirstSongIdForEvent = (event) => getSongItemsForEvent(event)[0]?.value || '';

  const buildEventActions = (event, { compact = false } = {}) => {
    if (!event?.id) return [];
    const songCount = getSongItemsForEvent(event).length;
    return [
      {
        label: compact ? 'Setlist' : 'Abrir Setlist',
        detail: `${songCount} canciones`,
        icon: ListMusic,
        path: `/setlist/${event.id}`,
        color: 'text-blue-300',
        visible: canOpenSetlist,
      },
      {
        label: compact ? 'Ensayo' : 'Acceso al ensayo',
        detail: 'Entrar por setlist',
        icon: Music,
        path: `/setlist/${event.id}`,
        color: 'text-emerald-300',
        visible: canOpenSetlist,
      },
      {
        label: compact ? 'Controlador' : 'Abrir Controlador',
        detail: 'Operar letras y medios',
        icon: PlayCircle,
        path: `/control-proyector/${event.id}`,
        color: 'text-violet-300',
        visible: canOpenController,
      },
      {
        label: compact ? 'Congregación' : 'Pantalla Congregación',
        detail: 'Salida pública',
        icon: Tv,
        path: `/proyector/${event.id}`,
        color: 'text-cyan-300',
        visible: canOpenController,
      },
      {
        label: compact ? 'Central' : 'Central Multimedia',
        detail: 'Pantallas y salidas',
        icon: Monitor,
        path: '/multimedia-hub',
        color: 'text-fuchsia-300',
        visible: canOpenCentral,
      },
      {
        label: compact ? 'Retorno voces' : 'Retorno Cantantes',
        detail: 'Letras para voces',
        icon: Mic2,
        path: `/retorno/${event.id}`,
        color: 'text-pink-300',
        visible: canOpenController || isSingerUser,
      },
      {
        label: compact ? 'Retorno músicos' : 'Retorno Músicos',
        detail: 'Acordes y secciones',
        icon: Headphones,
        path: `/retorno-musicos/${event.id}`,
        color: 'text-amber-300',
        visible: canOpenController || (isMusicianUser && !isSingerUser),
      },
    ].filter(action => action.visible);
  };

  const normalizeDashboardActions = (event, actions) => {
    const firstSongForEvent = getFirstSongIdForEvent(event);
    const outputOptions = actions
      .filter(action => action.path?.startsWith('/proyector/') || action.path?.startsWith('/retorno'))
      .map(action => ({
        label: action.path?.startsWith('/proyector/')
          ? 'Pantalla Congregación'
          : action.path?.startsWith('/retorno-musicos/')
            ? 'Retorno Músicos'
            : 'Retorno Cantantes',
        detail: action.path?.startsWith('/proyector/')
          ? 'Salida pública'
          : action.path?.startsWith('/retorno-musicos/')
            ? 'Acordes y secciones'
            : 'Letras para voces',
        icon: action.path?.startsWith('/proyector/')
          ? Tv
          : action.path?.startsWith('/retorno-musicos/')
            ? Headphones
            : Mic2,
        path: action.path,
        color: action.color,
      }));
    const normalized = actions
      .filter(action => !action.path?.startsWith('/retorno') && !action.path?.startsWith('/proyector/'))
      .map(action => {
        if (action.label === 'Acceso al ensayo' || action.label === 'Ensayo') {
          return {
            ...action,
            detail: firstSongForEvent ? 'Modo ensayo' : 'Sin canciones para ensayar',
            path: firstSongForEvent ? `/setlist/${event.id}?modo=ensayo` : '',
            disabled: !firstSongForEvent,
            group: 'primary',
          };
        }
        return { ...action, group: 'primary' };
      });

    if (outputOptions.length > 0) {
      normalized.push({
        label: 'Salidas',
        detail: `${outputOptions.length} disponibles`,
        icon: Tv,
        path: '',
        color: 'text-cyan-300',
        group: 'output',
        outputPicker: true,
        outputOptions,
      });
    }

    return normalized;
  };

  const quickActions = normalizeDashboardActions(proximoEvento, buildEventActions(proximoEvento));
  const primaryActions = quickActions.filter(action => action.group === 'primary');
  const outputActions = quickActions.filter(action => action.group === 'output');
  const hasMultipleUpcomingEvents = eventosProximos.length > 1;

  const getEventStatusLabel = (event, index) => {
    if (index === 0) return 'PROXIMO';
    if (index === 1) return 'SIGUIENTE';
    return `EVENTO ${index + 1}`;
  };

  const getCompactEventSummary = (event) => {
    const songCount = getSongItemsForEvent(event).length;
    const team = Array.isArray(event?.equipo) ? event.equipo.length : 0;
    const confirmed = Object.values(event?.estadoAsistencia || {}).filter(value => value === 'confirmado').length;
    const ensayoChecklist = event?.ensayoChecklist || {};
    const readyRehearsal = Object.values(ensayoChecklist).filter(item => item?.repasada && item?.tonoConfirmado && item?.entradaDefinida && item?.finalDefinido).length;
    const hasPreacher = Boolean(event?.predicadorId || event?.responsables?.Predicacion || event?.predicadorAsignado || event?.predicador || event?.preacher || event?.predicadorNombre || event?.preacherName);
    const pending = [
      songCount > 0,
      team === 0 || confirmed >= team,
      hasPreacher,
      Boolean(event?.fechaEnsayo || event?.ensayoFecha || event?.ensayo),
    ].filter(Boolean).length;
    const total = 4;
    const status = pending === total ? 'Listo' : songCount === 0 ? 'Incompleto' : 'En preparación';

    return { songCount, team, confirmed, readyRehearsal, hasPreacher, status, pending: total - pending };
  };

  const renderCompactUpcomingEventCard = (event, index) => {
    const eventDate = getEventDateForEvent(event);
    const eventActions = normalizeDashboardActions(event, buildEventActions(event, { compact: true }));
    const primary = eventActions.filter(action => action.group === 'primary');
    const outputs = eventActions.filter(action => action.group === 'output');
    const detailsOpen = Boolean(expandedDashboardEvents[event.id]);
    const summary = getCompactEventSummary(event);
    const statusTone = summary.status === 'Listo'
      ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300'
      : summary.status === 'Incompleto'
        ? 'border-red-500/25 bg-red-500/10 text-red-300'
        : 'border-amber-500/25 bg-amber-500/10 text-amber-300';

    return (
      <article key={event.id} className="kp-card flex min-w-[min(88vw,28rem)] snap-center flex-col rounded-[1.75rem] p-4 md:min-w-0 md:p-5">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="mb-2 flex flex-wrap items-center gap-2">
              <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-widest ${index === 0 ? 'border-violet-500/25 bg-violet-500/10 text-violet-300' : 'border-blue-500/25 bg-blue-500/10 text-blue-300'}`}>
                {getEventStatusLabel(event, index)}
              </span>
              <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-widest ${statusTone}`}>
                {summary.status}
              </span>
            </p>
            <h2 className="truncate text-xl font-black tracking-tight text-zinc-900 dark:text-white md:text-2xl">
              {event.titulo || 'Evento sin título'}
            </h2>
            <p className="mt-1 text-xs font-bold uppercase tracking-wide text-zinc-500">
              {eventDate?.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }) || 'Fecha sin definir'} · {getEventTimeLabelForEvent(event)}
            </p>
          </div>
          <span className="hidden shrink-0 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-center text-[10px] font-black uppercase text-zinc-400 md:block">
            {index + 1} de {eventosProximos.length}
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-blue-300">Canciones</p>
            <p className="text-xl font-black text-white">{summary.songCount}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-300">Equipo</p>
            <p className="text-xl font-black text-white">{summary.confirmed}/{summary.team}</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          {primary.map(action => {
            const Icon = action.icon;
            return (
              <button
                key={`${event.id}-${action.label}`}
                type="button"
                disabled={action.disabled}
                onClick={() => action.path && navigate(action.path)}
                className="kp-panel flex min-w-0 items-center gap-2 rounded-2xl px-3 py-2.5 text-left transition-colors hover:border-white/20 hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-55"
              >
                <Icon size={16} className={`${action.color} shrink-0`} />
                <span className="min-w-0">
                  <span className="block truncate text-[11px] font-black uppercase text-zinc-100">{action.label}</span>
                  <span className="block truncate text-[10px] font-semibold text-zinc-500">{action.detail}</span>
                </span>
              </button>
            );
          })}
        </div>

        {outputs.length > 0 && (
          <div className="mt-3">
            {outputs.map(action => {
              const Icon = action.icon;
              const pickerOpen = action.outputPicker && outputMenu?.eventId === event.id;
              return (
                <div key={`${event.id}-${action.label}`} className="relative min-w-0">
                  <button
                    type="button"
                    onClick={(clickEvent) => {
                      if (action.outputPicker) {
                        if (pickerOpen) closeOutputMenu();
                        else openOutputMenu(action, event.id, clickEvent);
                        return;
                      }
                      openOutputScreen(action.path);
                    }}
                    aria-expanded={action.outputPicker ? pickerOpen : undefined}
                    className="flex w-full min-w-0 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-[10px] font-black uppercase text-zinc-200 transition-colors hover:bg-white/[0.07]"
                  >
                    <Icon size={14} className={`${action.color} shrink-0`} />
                    <span className="truncate">{action.label}</span>
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={() => setExpandedDashboardEvents(prev => ({ ...prev, [event.id]: !prev[event.id] }))}
            className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[10px] font-black uppercase tracking-widest text-zinc-300"
          >
            {detailsOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {detailsOpen ? 'Ocultar detalles' : 'Ver detalles'}
          </button>
        </div>

        {detailsOpen && (
          <div className="mt-4 space-y-3 rounded-3xl border border-white/10 bg-black/20 p-4">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <p className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-xs font-bold text-zinc-400">
                <span className="block text-[10px] font-black uppercase tracking-widest text-zinc-500">Lugar</span>
                <span className="break-words text-zinc-100">{event.lugar || event.ubicacion || 'Lugar sin definir'}</span>
              </p>
              <p className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-xs font-bold text-zinc-400">
                <span className="block text-[10px] font-black uppercase tracking-widest text-zinc-500">Predicador</span>
                <span className="break-words text-zinc-100">{event.predicador || event.preacher || event.predicadorNombre || event.preacherName || (summary.hasPreacher ? 'Predicador asignado' : 'No asignado')}</span>
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[10px] font-black uppercase tracking-widest">
              <span className={`rounded-full px-3 py-2 ${summary.songCount > 0 ? 'bg-emerald-500/10 text-emerald-300' : 'bg-red-500/10 text-red-300'}`}>Setlist {summary.songCount > 0 ? 'OK' : 'pendiente'}</span>
              <span className={`rounded-full px-3 py-2 ${summary.hasPreacher ? 'bg-emerald-500/10 text-emerald-300' : 'bg-amber-500/10 text-amber-300'}`}>Predicador</span>
              <span className={`rounded-full px-3 py-2 ${summary.team > 0 ? 'bg-emerald-500/10 text-emerald-300' : 'bg-amber-500/10 text-amber-300'}`}>Equipo {summary.confirmed}/{summary.team}</span>
              <span className={`rounded-full px-3 py-2 ${event?.fechaEnsayo ? 'bg-emerald-500/10 text-emerald-300' : 'bg-amber-500/10 text-amber-300'}`}>Ensayo</span>
            </div>
          </div>
        )}
      </article>
    );
  };

  const getOutputMenuDesktopStyle = () => {
    if (typeof window === 'undefined' || !outputMenu?.anchorRect) {
      return { top: 96, left: 16, width: 320 };
    }
    const menuWidth = 320;
    const estimatedHeight = 220;
    const viewportPadding = 16;
    const maxLeft = window.innerWidth - menuWidth - viewportPadding;
    const left = Math.max(viewportPadding, Math.min(outputMenu.anchorRect.left, maxLeft));
    const preferredTop = outputMenu.anchorRect.bottom + 8;
    const top = preferredTop + estimatedHeight > window.innerHeight
      ? Math.max(viewportPadding, outputMenu.anchorRect.top - estimatedHeight - 8)
      : preferredTop;
    return { top, left, width: menuWidth };
  };

  return (
    <div className="max-w-6xl mx-auto animate-in fade-in duration-500">
      <header className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-3xl border border-white/10 bg-zinc-950/45 p-5 md:p-6 backdrop-blur-sm">
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
                  <h3 className="font-black text-lg">Has sido convocado</h3>
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

      {hasMultipleUpcomingEvents ? (
        <section className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.28em] text-violet-300">PRÓXIMOS CULTOS</p>
              <h2 className="mt-2 text-2xl font-black tracking-tight text-zinc-900 dark:text-white md:text-3xl">
                {eventosProximos.length} eventos programados
              </h2>
            </div>
            <p className="block text-xs font-black uppercase tracking-widest text-zinc-500 sm:hidden">
              En móvil desliza · 1 de {eventosProximos.length}
            </p>
          </div>
          <div className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto overscroll-x-contain px-4 pb-3 md:mx-0 md:grid md:grid-cols-2 md:overflow-visible md:px-0 xl:grid-cols-2">
            {eventosProximos.map((event, index) => renderCompactUpcomingEventCard(event, index))}
          </div>
        </section>
      ) : (
      <section className="kp-card rounded-[2rem] p-5 md:p-8">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-[0.28em] text-violet-300">PRÓXIMO CULTO</p>
            <h2 className="mt-2 text-2xl md:text-4xl font-black tracking-tight text-zinc-900 dark:text-white">
              {proximoEvento?.titulo || 'Sin evento programado'}
            </h2>
            <p className="mt-2 text-sm font-semibold text-zinc-500 dark:text-zinc-400">
              Preparación operativa para el siguiente servicio.
            </p>
          </div>
          <span className={`inline-flex w-fit items-center gap-2 rounded-full border px-4 py-2 text-[11px] font-black uppercase tracking-widest ${
            generalPreparationStatus === 'Listo'
              ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300'
              : generalPreparationStatus === 'Incompleto'
                ? 'border-red-500/25 bg-red-500/10 text-red-300'
                : 'border-amber-500/25 bg-amber-500/10 text-amber-300'
          }`}>
            {generalPreparationStatus === 'Listo' ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
            {generalPreparationStatus}
          </span>
        </div>

        {proximoEvento ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.25fr_0.75fr]">
              <div className="min-w-0 rounded-3xl border border-white/10 bg-black/20 p-4">
                <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-zinc-500">Acciones principales</p>
                <div className="grid grid-cols-2 gap-3">
                  {primaryActions.map(action => {
                    const Icon = action.icon;
                    return (
                      <button
                        key={action.label}
                        type="button"
                        disabled={action.disabled}
                        onClick={() => action.path && navigate(action.path)}
                        className="kp-panel flex min-h-[4.25rem] min-w-0 items-center gap-3 rounded-2xl px-3 py-3 text-left transition-all hover:border-white/20 hover:bg-white/[0.06] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-55"
                      >
                        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/[0.07] ${action.color}`}>
                          <Icon size={20} />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-black text-zinc-100">{action.label}</span>
                          <span className="block truncate text-xs font-semibold text-zinc-500">{action.detail}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {outputActions.length > 0 && (
                <div className="min-w-0 rounded-3xl border border-white/10 bg-white/[0.035] p-4">
                  <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-zinc-500">Salidas</p>
                  <div className="grid grid-cols-1 gap-3">
                    {outputActions.map(action => {
                      const Icon = action.icon;
                      const pickerOpen = action.outputPicker && outputMenu?.eventId === proximoEvento.id;
                      return (
                        <div key={action.label} className="relative min-w-0">
                          <button
                            type="button"
                            onClick={(clickEvent) => {
                              if (action.outputPicker) {
                                if (pickerOpen) closeOutputMenu();
                                else openOutputMenu(action, proximoEvento.id, clickEvent);
                                return;
                              }
                              openOutputScreen(action.path);
                            }}
                            aria-expanded={action.outputPicker ? pickerOpen : undefined}
                            className="kp-panel flex min-h-[4.25rem] w-full min-w-0 items-center gap-3 rounded-2xl px-3 py-3 text-left transition-all hover:border-white/20 hover:bg-white/[0.06] active:scale-[0.99]"
                          >
                            <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/[0.07] ${action.color}`}>
                              <Icon size={20} />
                            </span>
                            <span className="min-w-0">
                              <span className="block text-sm font-black text-zinc-100">{action.label}</span>
                              <span className="block truncate text-xs font-semibold text-zinc-500">{action.detail}</span>
                            </span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[
                { label: 'Canciones listas', value: `${nextSongItems.length}`, detail: 'en setlist', icon: ListMusic, tone: 'text-blue-300' },
                { label: 'Multimedia lista', value: `${songsWithMediaCount}/${cancionesEvento.length}`, detail: 'con recursos', icon: ImageIcon, tone: 'text-violet-300' },
                { label: 'Equipo confirmado', value: `${confirmedTeamCount}/${teamCount}`, detail: 'respuestas', icon: Users, tone: 'text-emerald-300' },
                { label: 'Pendientes', value: `${pendingCount}`, detail: pendingCount === 1 ? 'punto' : 'puntos', icon: AlertTriangle, tone: pendingCount > 0 ? 'text-amber-300' : 'text-emerald-300' },
              ].map(card => {
                const Icon = card.icon;
                return (
                  <div key={card.label} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                    <p className={`mb-1 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest ${card.tone}`}><Icon size={14}/> {card.label}</p>
                    <p className="text-2xl md:text-3xl font-black text-white">{card.value}</p>
                    <p className="text-xs font-semibold text-zinc-500">{card.detail}</p>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-center sm:justify-end">
              <button
                type="button"
                onClick={() => setShowEventDetails(prev => !prev)}
                className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-xs font-black uppercase tracking-widest text-zinc-300 transition-colors hover:border-white/20 hover:bg-white/[0.07]"
              >
                {showEventDetails ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                {showEventDetails ? 'Ocultar detalles' : 'Ver detalles'}
              </button>
            </div>

          {showEventDetails && <div className="grid min-w-0 grid-cols-1 gap-6 2xl:grid-cols-[1.05fr_0.95fr]">
            <div className="min-w-0 space-y-5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="kp-panel min-w-0 rounded-2xl p-4">
                  <p className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-zinc-500"><Calendar size={14}/> Fecha</p>
                  <p className="text-sm font-black text-zinc-100">{getEventDate()?.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }) || 'Fecha sin definir'}</p>
                </div>
                <div className="kp-panel min-w-0 rounded-2xl p-4">
                  <p className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-zinc-500"><Clock size={14}/> Hora</p>
                  <p className="text-sm font-black text-zinc-100">{getEventTimeLabel()}</p>
                </div>
                <div className="kp-panel min-w-0 rounded-2xl p-4">
                  <p className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-zinc-500"><MapPin size={14}/> Lugar</p>
                  <p className="break-words text-sm font-black text-zinc-100">{proximoEvento.lugar || proximoEvento.ubicacion || 'Lugar sin definir'}</p>
                </div>
                <div className="kp-panel min-w-0 rounded-2xl p-4">
                  <p className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-zinc-500"><UserRound size={14}/> Predicador</p>
                  <p className="break-words text-sm font-black text-zinc-100">{getPredicadorName() || 'No asignado'}</p>
                </div>
              </div>

              <div className="min-w-0 rounded-3xl border border-white/10 bg-black/20 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Setlist asignado</p>
                    <p className="text-sm font-black text-zinc-100">{getSongItems().length > 0 ? 'Canciones del próximo culto' : 'Sin canciones agregadas'}</p>
                  </div>
                  <button onClick={() => navigate(`/setlist/${proximoEvento.id}`)} className="kp-button-secondary shrink-0 rounded-xl px-3 py-2 text-[10px] font-black uppercase">Abrir setlist</button>
                </div>
                <div className="space-y-2">
                  {getSongItems().slice(0, 6).map((item, idx) => {
                    const cancion = cancionesEvento.find(c => c.id === item.value);
                    if (!cancion) return null;
                    return (
                      <button key={`${cancion.id}-${idx}`} onClick={() => navigate(`/setlist/${proximoEvento.id}`)} className="flex w-full min-w-0 items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-left transition-colors hover:border-blue-400/40">
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-black text-zinc-100">{idx + 1}. {cancion.titulo}</span>
                          <span className="text-xs font-semibold text-zinc-500">Tono: {traducirAcorde(cancion.tonoOriginal || 'C', formatoAcordes, notacion)} {cancion.bpm ? `| ${cancion.bpm} BPM` : ''}</span>
                        </span>
                        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[9px] font-black uppercase ${hasSongMedia(cancion) ? 'bg-emerald-500/10 text-emerald-300' : 'bg-amber-500/10 text-amber-300'}`}>
                          {hasSongMedia(cancion) ? 'Media' : 'Sin media'}
                        </span>
                      </button>
                    );
                  })}
                  {getSongItems().length > 6 && <p className="px-2 text-xs font-bold text-zinc-500">+ {getSongItems().length - 6} canciones más en el setlist.</p>}
                  {getSongItems().length === 0 && <p className="kp-empty-state rounded-2xl p-5 text-center text-sm font-bold">No hay canciones agregadas a este evento.</p>}
                </div>
              </div>
            </div>

            <aside className="min-w-0 space-y-5">
              <div className="min-w-0 rounded-3xl border border-white/10 bg-white/[0.04] p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Checklist</p>
                    <h3 className="text-lg font-black text-white">Preparación del culto</h3>
                  </div>
                  <span className="rounded-full bg-white/[0.06] px-3 py-1 text-[10px] font-black uppercase text-zinc-300">{preparationChecklist.filter(item => item.status === 'ready').length}/{preparationChecklist.length}</span>
                </div>
                <div className="space-y-2">
                  {preparationChecklist.map(item => (
                    <div key={item.label} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-zinc-950/25 p-3">
                      <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${item.status === 'ready' ? 'bg-emerald-500/15 text-emerald-300' : item.status === 'neutral' ? 'bg-blue-500/15 text-blue-300' : item.status === 'incomplete' ? 'bg-red-500/15 text-red-300' : 'bg-amber-500/15 text-amber-300'}`}>
                        {item.status === 'ready' ? <CheckCircle2 size={14} /> : item.status === 'neutral' ? <Monitor size={14} /> : <XCircle size={14} />}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-black text-zinc-100">{item.label}</span>
                        <span className="block text-xs font-semibold text-zinc-500">{item.detail}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="min-w-0 rounded-3xl border border-amber-500/20 bg-amber-500/10 p-5">
                <p className="mb-3 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-amber-300"><AlertTriangle size={15}/> Alertas útiles</p>
                {operationalAlerts.length > 0 ? (
                  <div className="space-y-2">
                    {operationalAlerts.map((alert, idx) => (
                      <p key={`${alert}-${idx}`} className="rounded-2xl border border-amber-500/15 bg-black/20 px-3 py-2 text-sm font-bold text-amber-50">{alert}</p>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-3 text-sm font-black text-emerald-200">Todo lo principal está listo para el próximo culto.</p>
                )}
              </div>
            </aside>
          </div>}
          </div>
        ) : (
          <div className="kp-empty-state rounded-3xl px-5 py-12 text-center">
            <Calendar className="mx-auto mb-4 text-zinc-600" size={44} />
            <p className="mb-2 text-lg font-black text-zinc-200">No hay un culto próximo programado.</p>
            <p className="mx-auto mb-5 max-w-md text-sm font-semibold text-zinc-500">Cuando programes un evento, aquí aparecerá el checklist operativo para preparar setlist, equipo, multimedia, predicador y ensayo.</p>
            {!esMusico && <button onClick={() => navigate('/eventos')} className="kp-button-primary rounded-2xl px-5 py-3 text-xs font-black uppercase">Programar evento</button>}
          </div>
        )}
      </section>
      )}
      {/* Tarjeta de Cumpleaños */}
      <div className="kp-card mt-6 p-6 rounded-3xl transition-colors animate-in slide-in-from-bottom-5">
        <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-4 flex items-center gap-2">
          <Cake size={20} className="text-pink-500" /> Cumpleaños del Equipo
        </h3>
        <div className="space-y-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4">
          {cumpleanos.length > 0 ? cumpleanos.map((c, i) => (
            <div key={i} className="flex items-center justify-between p-3 rounded-2xl bg-white/[0.04] border border-white/10">
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
          <div className="flex items-center gap-3"> {/* Botón de prueba de notificación movido a UserProfile.jsx */}
            {cleanResult && <span className="text-xs font-bold text-red-600 bg-red-100 px-3 py-2 rounded-lg">{cleanResult}</span>}
            <button onClick={handleMantenimiento} disabled={isCleaning} className="bg-red-600 hover:bg-red-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl transition-colors shadow-sm disabled:opacity-50">{isCleaning ? 'Limpiando...' : 'Iniciar Limpieza'}</button>
          </div>
        </div>
      )}
      {outputMenu && typeof document !== 'undefined' && createPortal(
        isMobileOutputMenu ? (
          <div className="fixed inset-0 z-[260] flex items-end bg-black/70 p-3 backdrop-blur-sm" onClick={closeOutputMenu}>
            <div
              className="w-full rounded-t-[2rem] border border-white/10 bg-zinc-950 p-4 text-white shadow-2xl shadow-black animate-in slide-in-from-bottom-4"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.28em] text-cyan-300">Salidas</p>
                  <p className="text-sm font-semibold text-zinc-500">Elige una pantalla para este evento.</p>
                </div>
                <button
                  type="button"
                  onClick={closeOutputMenu}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] text-zinc-300"
                  aria-label="Cerrar salidas"
                >
                  <XCircle size={18} />
                </button>
              </div>
              <div className="space-y-2">
                {outputMenu.options.map(option => {
                  const OptionIcon = option.icon;
                  return (
                    <button
                      key={`${outputMenu.eventId}-${option.path}`}
                      type="button"
                      onClick={() => chooseOutputOption(option.path)}
                      className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-left active:scale-[0.99]"
                    >
                      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/[0.07] ${option.color}`}>
                        <OptionIcon size={19} />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-black text-zinc-100">{option.label}</span>
                        <span className="block truncate text-xs font-semibold text-zinc-500">{option.detail}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="fixed inset-0 z-[240]" onClick={closeOutputMenu}>
            <div
              className="fixed rounded-2xl border border-white/10 bg-zinc-950 p-2 text-white shadow-2xl shadow-black/40"
              style={getOutputMenuDesktopStyle()}
              onClick={(event) => event.stopPropagation()}
            >
              {outputMenu.options.map(option => {
                const OptionIcon = option.icon;
                return (
                  <button
                    key={`${outputMenu.eventId}-${option.path}`}
                    type="button"
                    onClick={() => chooseOutputOption(option.path)}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-white/[0.06]"
                  >
                    <OptionIcon size={17} className={option.color} />
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-black text-zinc-100">{option.label}</span>
                      <span className="block truncate text-[11px] font-semibold text-zinc-500">{option.detail}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ),
        document.body
      )}
    </div>
  );
};

export default AdminDashboard;
