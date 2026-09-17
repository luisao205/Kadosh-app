import React, { useRef, useState, useEffect } from 'react';
import { collection, query, where, getDocs, orderBy, limit, doc, onSnapshot, setDoc, updateDoc, deleteField, serverTimestamp } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useNavigate } from 'react-router-dom';
import { Monitor, Film, Layers, Play, Calendar, ExternalLink, Tv, Plus, Trash2, X, Loader2, Fingerprint, CircleHelp, WifiOff, CheckCircle2, RefreshCw, BookOpen, MessageSquare, Send, Ban } from 'lucide-react';
import { formatEventDate, parseAppDate } from '../../utils/dateUtils';
import {
  OUTPUT_SCREEN_TEST_DURATION_MS,
  OUTPUT_TYPE_LABELS,
  formatOutputLastSignal,
  getOutputPresenceState,
  getOutputPresenceTimestamp,
} from '../../utils/outputPresence';
import { isAdmin, isMultimedia, isOwner } from '../../utils/rolePermissions';
import { PREACHER_REQUEST_STATUS, PREACHER_REQUEST_TYPES, MULTIMEDIA_TO_PASTOR_PRESETS, buildPreachingProjectorState } from '../../utils/preachingLive';
import { createInactiveSongLiveState } from '../../utils/liveState';
import { useFeedback } from '../ui/FeedbackProvider';

const OUTPUT_STATUS_STYLES = {
  unknown: {
    badgeClass: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
    icon: CircleHelp,
  },
  online: {
    badgeClass: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
    icon: CheckCircle2,
  },
  offline: {
    badgeClass: 'border-red-500/30 bg-red-500/10 text-red-200',
    icon: WifiOff,
  },
};

const MultimediaHub = ({ user }) => {
  const navigate = useNavigate();
  const { notify } = useFeedback();
  const [eventos, setEventos] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Estados para la Matriz de Salidas
  const [outputs, setOutputs] = useState({});
  const [outputDrafts, setOutputDrafts] = useState({});
  const [savingOutputs, setSavingOutputs] = useState({});
  const [hubFeedback, setHubFeedback] = useState(null);
  const [availableScreens, setAvailableScreens] = useState([]);
  const [showManager, setShowManager] = useState(false);
  const [now, setNow] = useState(Date.now());
  
  // Modales
  const [confirmModal, setConfirmModal] = useState({ show: false, id: null, label: '' });
  const [testModal, setTestModal] = useState({ show: false, id: null, label: '' });
  const [preacherRequests, setPreacherRequests] = useState([]);
  const [preachingStatuses, setPreachingStatuses] = useState([]);
  const [handlingRequestId, setHandlingRequestId] = useState('');
  const canHandlePastorRequests = isOwner(user) || isMultimedia(user);
  const canReadPastorRequests = canHandlePastorRequests || isAdmin(user);
  const feedbackTimerRef = useRef(null);
  const testFinishedTimerRef = useRef(null);

  const showHubFeedback = (message, type = 'success') => {
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    setHubFeedback({ message, type });
    feedbackTimerRef.current = setTimeout(() => setHubFeedback(null), 4500);
  };

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 15000);
    return () => {
      clearInterval(interval);
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
      if (testFinishedTimerRef.current) clearTimeout(testFinishedTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!canReadPastorRequests || eventos.length === 0) {
      setPreacherRequests([]);
      setPreachingStatuses([]);
      return undefined;
    }

    const requestUnsubs = [];
    const statusUnsubs = [];
    const requestMap = new Map();
    const statusMap = new Map();

    const publishRequests = () => {
      const next = Array.from(requestMap.values())
        .flat()
        .sort((a, b) => (a.createdAt?.toMillis?.() || 0) - (b.createdAt?.toMillis?.() || 0));
      setPreacherRequests(next);
    };

    const publishStatuses = () => {
      setPreachingStatuses(Array.from(statusMap.values()).flat());
    };

    eventos.forEach(evento => {
      const requestQuery = query(
        collection(db, 'eventos', evento.id, 'preacherRequests'),
        where('status', 'in', [PREACHER_REQUEST_STATUS.PENDING, PREACHER_REQUEST_STATUS.PROJECTED, PREACHER_REQUEST_STATUS.IGNORED]),
        orderBy('createdAt', 'asc'),
        limit(8)
      );
      requestUnsubs.push(onSnapshot(requestQuery, (snap) => {
        const items = snap.docs.map(item => ({ id: item.id, eventId: evento.id, eventTitle: evento.titulo, ...item.data() }));
        const previousPendingIds = new Set((requestMap.get(evento.id) || []).filter(item => item.status === PREACHER_REQUEST_STATUS.PENDING).map(item => item.id));
        const newPending = items.find(item => item.status === PREACHER_REQUEST_STATUS.PENDING && !previousPendingIds.has(item.id));
        requestMap.set(evento.id, items);
        publishRequests();
        if (newPending) notify(`Nueva solicitud del Pastor: ${newPending.reference || newPending.title || newPending.message || 'Contenido'}.`, { type: 'info' });
      }));

      statusUnsubs.push(onSnapshot(collection(db, 'eventos', evento.id, 'preachingStatus'), (snap) => {
        statusMap.set(evento.id, snap.docs.map(item => ({ id: item.id, eventId: evento.id, eventTitle: evento.titulo, ...item.data() })));
        publishStatuses();
      }));
    });

    return () => {
      requestUnsubs.forEach(unsub => unsub());
      statusUnsubs.forEach(unsub => unsub());
    };
  }, [canReadPastorRequests, eventos, notify]);

  // Escuchar configuración de salidas globales
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'eventos', 'global'), (snap) => {
      if (snap.exists()) {
        setOutputs(snap.data().outputs || {});
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    setOutputDrafts(prev => {
      const next = { ...prev };
      Object.entries(outputs).forEach(([id, out]) => {
        if (next[id] === undefined) next[id] = out?.label || '';
      });
      Object.keys(next).forEach(id => {
        if (!outputs[id]) delete next[id];
      });
      return next;
    });
  }, [outputs]);

  // Detectar monitores físicos
  const detectarPantallas = async () => {
    try {
      if (!window.getScreenDetails) return;
      const screenDetails = await window.getScreenDetails();
      setAvailableScreens(screenDetails.screens);
      screenDetails.onscreenschange = () => setAvailableScreens(screenDetails.screens);
    } catch (e) {
      console.error(e);
      showHubFeedback('No se pudieron detectar las pantallas disponibles.', 'error');
    }
  };

  const handleUpdateOutput = async (id, data, options = {}) => {
    setSavingOutputs(prev => ({ ...prev, [id]: true }));
    try {
      const updates = Object.entries(data).reduce((acc, [key, value]) => {
        acc[`outputs.${id}.${key}`] = value;
        return acc;
      }, {});
      await updateDoc(doc(db, 'eventos', 'global'), updates);
      if (!options.silent) showHubFeedback(options.successMessage || 'Salida actualizada.', 'success');
    } catch (error) {
      console.error('Error actualizando salida:', error);
      showHubFeedback('No se pudo guardar la salida. Intenta nuevamente.', 'error');
      throw error;
    } finally {
      setSavingOutputs(prev => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  };

  const handleOutputLabelChange = (id, value) => {
    setOutputDrafts(prev => ({ ...prev, [id]: value }));
  };

  const saveOutputLabel = async (id) => {
    const currentLabel = outputs[id]?.label || '';
    const nextLabel = (outputDrafts[id] ?? '').trim();
    if (!nextLabel) {
      setOutputDrafts(prev => ({ ...prev, [id]: currentLabel }));
      showHubFeedback('El nombre de la salida no puede quedar vacio.', 'error');
      return;
    }
    if (nextLabel === currentLabel) return;
    await handleUpdateOutput(id, { label: nextLabel }, { successMessage: 'Nombre de salida guardado.' });
  };

  const handleIdentifyOutput = async (id) => {
    try {
      await updateDoc(doc(db, 'eventos', 'global'), { [`outputs.${id}.identifyAt`]: Date.now() });
      showHubFeedback('Identificacion enviada a la pantalla.', 'success');
    } catch (error) {
      console.error('Error identificando salida:', error);
      showHubFeedback('No se pudo identificar la salida.', 'error');
    }
  };

  const openScreenTest = (id, output, status) => {
    if (status.key !== 'online') {
      showHubFeedback('No se puede probar una salida que no esta en linea.', 'error');
      return;
    }
    setTestModal({ show: true, id, label: output?.label || 'Salida sin nombre' });
  };

  const handleScreenTest = async (id) => {
    const output = outputs[id];
    const status = getOutputPresenceState(output, Date.now());
    if (status.key !== 'online') {
      setTestModal({ show: false, id: null, label: '' });
      showHubFeedback('No se pudo enviar la prueba: la salida ya no esta en linea.', 'error');
      return;
    }

    const startedAt = Date.now();
    try {
      await updateDoc(doc(db, 'eventos', 'global'), {
        [`outputs.${id}.screenTest`]: {
          id: `test_${startedAt}`,
          requestedAt: startedAt,
          until: startedAt + OUTPUT_SCREEN_TEST_DURATION_MS,
          durationMs: OUTPUT_SCREEN_TEST_DURATION_MS,
        },
      });
      setTestModal({ show: false, id: null, label: '' });
      showHubFeedback(`Prueba enviada a ${output?.label || 'la salida'}.`, 'success');
      if (testFinishedTimerRef.current) clearTimeout(testFinishedTimerRef.current);
      testFinishedTimerRef.current = setTimeout(() => {
        showHubFeedback('Prueba finalizada.', 'success');
      }, OUTPUT_SCREEN_TEST_DURATION_MS);
    } catch (error) {
      console.error('Error enviando prueba de salida:', error);
      showHubFeedback('No se pudo enviar la prueba a la salida.', 'error');
    }
  };

  const crearOutput = async () => {
    const id = `out_${Date.now()}`;
    const newOutputs = { 
      ...outputs, 
      [id]: { label: `Nueva Salida ${Object.keys(outputs).length + 1}`, type: 'proyector' } 
    };
    try {
      await setDoc(doc(db, 'eventos', 'global'), { outputs: newOutputs }, { merge: true });
      showHubFeedback('Salida creada correctamente.', 'success');
    } catch (error) {
      console.error('Error creando salida:', error);
      showHubFeedback('No se pudo crear la salida.', 'error');
    }
  };

  const eliminarOutput = async (id) => {
    try {
      await updateDoc(doc(db, 'eventos', 'global'), { [`outputs.${id}`]: deleteField() });
      setConfirmModal({ show: false, id: null, label: '' });
      showHubFeedback('Salida eliminada correctamente.', 'success');
    } catch (error) {
      console.error('Error eliminando salida:', error);
      showHubFeedback('No se pudo eliminar la salida.', 'error');
    }
  };

  const lanzarSalida = (id) => {
    const out = outputs[id];
    if (!out) return;
    
    // Intentamos lanzar al monitor global (o proyector del evento activo si lo hubiera)
    const path = `/output/global/${id}`;
    const windowName = `output_${id}`;
    
    let features = 'width=1280,height=720,menubar=no,toolbar=no';
    
    if (out.screenId && availableScreens.length > 0) {
      const target = availableScreens.find(s => s.id === out.screenId);
      if (target) {
        features = `left=${target.availLeft},top=${target.availTop},width=${target.availWidth},height=${target.availHeight},menubar=no,toolbar=no,fullscreen=yes`;
      }
    }
    
    window.open(path, windowName, features);
  };

  useEffect(() => {
    const fetchEventos = async () => {
      try {
        const hoy = new Date().toISOString().slice(0, 10);
        const q = query(
          collection(db, 'eventos'), 
          where('fecha', '>=', hoy),
          orderBy('fecha', 'asc'),
          limit(10)
        );
        const snap = await getDocs(q);
        setEventos(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(ev => parseAppDate(ev.fecha)));
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchEventos();
  }, []);

  const formatFriendlyDate = (dateValue) => {
    return formatEventDate(dateValue, { weekday: 'long', day: 'numeric', month: 'long' });
  };

  const handleOpenScreen = (path) => {
    window.open(path, '_blank');
  };

  const projectPreacherRequest = async (request) => {
    if (!canHandlePastorRequests || !request?.eventId || handlingRequestId) return;
    setHandlingRequestId(request.id);
    try {
      const projectorState = buildPreachingProjectorState(request, user);
      const updates = {
        projectorState,
        proyectorSlide: null,
        proyectorMedia: null,
        proyectorLogo: false,
        proyectorApagado: false,
        proyectorFondo: null,
        proyectorFondoMedia: null,
        proyectorSongId: null,
        proyectorSlideIndex: -1,
        proyectorNextSlide: null,
        proyectorNextSong: null,
        liveState: createInactiveSongLiveState({
          contentType: 'preaching',
          contentTitle: request.title || request.reference || 'Predica',
          updatedBy: user?.nombre || user?.email || 'Multimedia'
        }),
        currentSongId: null
      };
      await setDoc(doc(db, 'eventos', request.eventId), updates, { merge: true });
      await updateDoc(doc(db, 'eventos', request.eventId, 'preacherRequests', request.id), {
        status: PREACHER_REQUEST_STATUS.PROJECTED,
        handledAt: serverTimestamp(),
        handledBy: {
          uid: user?.uid || null,
          name: user?.nombre || user?.email || 'Multimedia',
          role: user?.rol || user?.role || ''
        },
        updatedAt: serverTimestamp()
      });
      notify('Contenido de predica proyectado.', { type: 'success' });
    } catch (error) {
      console.error('Error proyectando solicitud del Pastor:', error);
      notify('No se pudo proyectar el contenido.', { type: 'error' });
    } finally {
      setHandlingRequestId('');
    }
  };

  const ignorePreacherRequest = async (request) => {
    if (!canHandlePastorRequests || !request?.eventId || handlingRequestId) return;
    setHandlingRequestId(request.id);
    try {
      await updateDoc(doc(db, 'eventos', request.eventId, 'preacherRequests', request.id), {
        status: PREACHER_REQUEST_STATUS.IGNORED,
        handledAt: serverTimestamp(),
        handledBy: {
          uid: user?.uid || null,
          name: user?.nombre || user?.email || 'Multimedia',
          role: user?.rol || user?.role || ''
        },
        updatedAt: serverTimestamp()
      });
      notify('Solicitud marcada como no proyectada.', { type: 'success' });
    } catch (error) {
      console.error('Error ignorando solicitud del Pastor:', error);
      notify('No se pudo ignorar la solicitud.', { type: 'error' });
    } finally {
      setHandlingRequestId('');
    }
  };

  const sendPastorPreset = async (evento, message) => {
    if (!canHandlePastorRequests || !evento?.id) return;
    try {
      await setDoc(doc(db, 'eventos', evento.id, 'private', 'preacher'), {
        mensajesInternos: message,
        updatedAt: Date.now(),
        sentBy: user?.nombre || user?.email || 'Multimedia'
      }, { merge: true });
      notify('Aviso enviado al Pastor.', { type: 'success' });
    } catch (error) {
      console.error('Error enviando aviso al Pastor:', error);
      notify('No se pudo enviar el aviso al Pastor.', { type: 'error' });
    }
  };

  const outputEntries = Object.entries(outputs);
  const outputStatusItems = outputEntries.map(([id, out]) => ({
    id,
    output: out,
    timestamp: getOutputPresenceTimestamp(out),
    status: getOutputPresenceState(out, now),
  }));
  const onlineCount = outputStatusItems.filter(item => item.status.key === 'online').length;
  const offlineCount = outputStatusItems.filter(item => item.status.key === 'offline').length;
  const unknownCount = outputStatusItems.filter(item => item.status.key === 'unknown').length;

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-zinc-900 dark:text-white flex items-center gap-3">
            <Monitor className="text-violet-600" size={32} /> Central Multimedia
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400 font-medium mt-1">Gestión de proyección, setlists y videos en vivo.</p>
        </div>
        <button 
          onClick={() => setShowManager(true)}
          className="flex items-center gap-2 px-6 py-3 bg-violet-600 text-white rounded-2xl font-black shadow-xl hover:bg-violet-500 transition-all active:scale-95"
        >
          <Tv size={20} /> GESTIONAR PANTALLAS
        </button>
      </div>

      {hubFeedback && (
        <div className={`rounded-2xl border px-4 py-3 text-sm font-bold ${
          hubFeedback.type === 'error'
            ? 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-200'
            : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200'
        }`}>
          {hubFeedback.message}
        </div>
      )}

      {canReadPastorRequests && (
        <section className="bg-zinc-950 border border-zinc-800 rounded-3xl p-5 md:p-6 shadow-2xl shadow-black/20">
          <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-amber-300">Predicador</p>
              <h2 className="text-2xl font-black text-white">Solicitudes del Pastor</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {preachingStatuses.slice(0, 3).map(status => (
                <span key={`${status.eventId}_${status.id}`} className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-black uppercase text-zinc-300">
                  {status.pastorName}: Punto {status.currentStep || 0} de {status.totalSteps || 0}
                </span>
              ))}
            </div>
          </div>

          {preacherRequests.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/40 p-4 text-sm font-bold text-zinc-500">No hay solicitudes pendientes.</p>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {preacherRequests.slice(0, 8).map(request => {
                const isPending = request.status === PREACHER_REQUEST_STATUS.PENDING;
                const isQuickAlert = request.type === PREACHER_REQUEST_TYPES.QUICK_ALERT;
                return (
                  <article key={request.id} className={`rounded-3xl border p-4 ${isPending ? 'border-amber-400/25 bg-amber-500/10' : 'border-white/10 bg-zinc-900/60'}`}>
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">{request.eventTitle || 'Evento'} / {request.preacherName || 'Pastor'}</p>
                        <h3 className="mt-1 text-lg font-black text-white">{isQuickAlert ? request.message : (request.reference || request.title || 'Solicitud')}</h3>
                        {request.translation && <p className="text-xs font-black uppercase text-blue-200">{request.translation}</p>}
                      </div>
                      <span className="rounded-full border border-white/10 bg-black/25 px-2.5 py-1 text-[10px] font-black uppercase text-zinc-300">{request.status}</span>
                    </div>
                    {!isQuickAlert && (
                      <p className="line-clamp-3 whitespace-pre-wrap rounded-2xl bg-black/25 p-3 text-sm font-semibold leading-relaxed text-zinc-200">
                        {request.text || (request.type === PREACHER_REQUEST_TYPES.VERSE ? 'Texto no guardado.' : request.title)}
                      </p>
                    )}
                    {isPending && canHandlePastorRequests && !isQuickAlert && (
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <button disabled={handlingRequestId === request.id} onClick={() => projectPreacherRequest(request)} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-violet-600 px-4 py-3 text-xs font-black uppercase text-white disabled:opacity-50">
                          <Send size={15} /> Proyectar
                        </button>
                        <button disabled={handlingRequestId === request.id} onClick={() => ignorePreacherRequest(request)} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-zinc-900 px-4 py-3 text-xs font-black uppercase text-zinc-200 disabled:opacity-50">
                          <Ban size={15} /> Ignorar
                        </button>
                      </div>
                    )}
                    {isPending && canHandlePastorRequests && isQuickAlert && (
                      <button disabled={handlingRequestId === request.id} onClick={() => ignorePreacherRequest(request)} className="mt-3 rounded-2xl border border-white/10 bg-zinc-900 px-4 py-3 text-xs font-black uppercase text-zinc-200 disabled:opacity-50">
                        Marcar visto
                      </button>
                    )}
                  </article>
                );
              })}
            </div>
          )}

          {canHandlePastorRequests && eventos.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {MULTIMEDIA_TO_PASTOR_PRESETS.map(message => (
                <button key={message} onClick={() => sendPastorPreset(eventos[0], message)} className="rounded-2xl border border-cyan-400/20 bg-cyan-500/10 px-3 py-2 text-[10px] font-black uppercase text-cyan-100">
                  <MessageSquare size={13} className="mr-1 inline" /> {message}
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="bg-zinc-950 border border-zinc-800 rounded-3xl p-5 md:p-6 shadow-2xl shadow-black/20">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-5">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-violet-300">Estado de pantallas</p>
            <h2 className="text-2xl font-black text-white mt-1">
              {onlineCount} en linea / {unknownCount} por verificar{offlineCount ? ` / ${offlineCount} sin conexion` : ''}
            </h2>
            <p className="text-sm text-zinc-500 font-medium mt-1">
              La matriz muestra presencia real solo si una salida reporta una senal reciente.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              onClick={detectarPantallas}
              className="px-4 py-3 rounded-2xl bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs font-black uppercase tracking-widest hover:border-violet-500/50 transition-colors flex items-center justify-center gap-2"
            >
              <RefreshCw size={15} /> {availableScreens.length > 0 ? `${availableScreens.length} monitores` : 'Detectar monitores'}
            </button>
            <button
              onClick={() => setShowManager(true)}
              className="px-4 py-3 rounded-2xl bg-violet-600 text-white text-xs font-black uppercase tracking-widest hover:bg-violet-500 transition-colors flex items-center justify-center gap-2"
            >
              <Tv size={15} /> Matriz
            </button>
          </div>
        </div>

        {outputStatusItems.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-zinc-800 bg-zinc-900/40 p-6 text-center">
            <Tv className="mx-auto text-zinc-600 mb-3" size={34} />
            <h3 className="text-white font-black">No hay salidas configuradas</h3>
            <p className="text-zinc-500 text-sm font-medium mt-1">Crea una salida virtual para proyector, predicador o retornos desde la matriz.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            {outputStatusItems.map(({ id, output, timestamp, status }) => {
              const statusStyle = OUTPUT_STATUS_STYLES[status.key] || OUTPUT_STATUS_STYLES.unknown;
              const StatusIcon = statusStyle.icon;
              return (
                <article key={id} className="rounded-3xl bg-zinc-900/80 border border-zinc-800 p-4 min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-white font-black truncate">{output?.label || 'Salida sin nombre'}</h3>
                      <p className="text-[11px] text-zinc-500 font-black uppercase tracking-widest mt-1">
                        {OUTPUT_TYPE_LABELS[output?.type] || output?.type || 'Sin tipo'}
                      </p>
                    </div>
                    <span className={`shrink-0 inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-black uppercase ${statusStyle.badgeClass}`}>
                      <StatusIcon size={12} /> {status.label}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500 mt-3 font-medium">{status.description}</p>
                  <p className="text-[11px] text-zinc-600 mt-1 font-bold">{formatOutputLastSignal(timestamp, now)}</p>
                  <div className="grid grid-cols-3 gap-2 mt-4">
                    <button
                      onClick={() => lanzarSalida(id)}
                      className="rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white py-2 text-[10px] font-black uppercase transition-colors"
                    >
                      Abrir
                    </button>
                    <button
                      onClick={() => handleIdentifyOutput(id)}
                      className="rounded-xl bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/20 text-blue-200 py-2 text-[10px] font-black uppercase transition-colors"
                    >
                      Identificar
                    </button>
                    <button
                      type="button"
                      onClick={() => openScreenTest(id, output, status)}
                      className={`rounded-xl py-2 text-[10px] font-black uppercase transition-colors ${
                        status.key === 'online'
                          ? 'bg-emerald-500/10 border border-emerald-500/25 text-emerald-200 hover:bg-emerald-500/20'
                          : 'bg-zinc-950 border border-zinc-800 text-zinc-600'
                      }`}
                    >
                      Probar
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Control Sin Setlist */}
        <div className="bg-gradient-to-br from-violet-600 to-indigo-700 rounded-3xl p-8 text-white shadow-2xl shadow-indigo-500/20 flex flex-col justify-between group">
          <div>
            <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center mb-6 backdrop-blur-md">
              <Film size={32} />
            </div>
            <h2 className="text-2xl font-black mb-2">Control Solo Medios</h2>
            <p className="text-indigo-100 font-medium leading-relaxed">Proyecta videos, fondos y logos sin necesidad de cargar una cancion o setlist específico.</p>
          </div>
          <button 
            onClick={() => navigate('/control-proyector/global', { state: { returnTo: '/multimedia-hub' } })}
            className="mt-8 w-full py-4 bg-white text-indigo-700 rounded-2xl font-black flex items-center justify-center gap-2 hover:bg-indigo-50 transition-colors shadow-lg"
          >
            <Play size={20} /> INICIAR CONTROLADOR LIBRE
          </button>
        </div>

        {/* Control con Setlist */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-8 flex flex-col">
          <h2 className="text-xl font-black text-zinc-900 dark:text-white mb-6 flex items-center gap-2">
            <Calendar className="text-emerald-500" size={24} /> Setlists Disponibles
          </h2>
          <div className="space-y-3 flex-1 overflow-y-auto max-h-[300px] pr-2 [&::-webkit-scrollbar]:hidden">
            {loading ? (
              <p className="text-zinc-500 italic animate-pulse">Buscando eventos próximos...</p>
            ) : eventos.length === 0 ? (
              <p className="text-zinc-500 italic">No hay eventos próximos creados.</p>
            ) : eventos.map(ev => (
              <div
                key={ev.id}
                className="p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl border border-zinc-100 dark:border-zinc-800"
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="text-left min-w-0">
                    <p className="font-black text-zinc-800 dark:text-zinc-200 truncate">{ev.titulo}</p>
                    <p className="text-xs text-zinc-500 font-bold">{formatFriendlyDate(ev.fecha)}</p>
                  </div>
                  <Layers size={20} className="text-zinc-400 shrink-0" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    onClick={() => navigate(`/control-proyector/${ev.id}`, { state: { returnTo: '/multimedia-hub' } })}
                    className="px-3 py-2.5 rounded-xl bg-violet-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-violet-500 transition-colors"
                  >
                    Controlador
                  </button>
                  <button
                    onClick={() => handleOpenScreen(`/proyector/${ev.id}`)}
                    className="px-3 py-2.5 rounded-xl bg-zinc-900 dark:bg-zinc-950 text-white text-[10px] font-black uppercase tracking-widest hover:bg-zinc-800 transition-colors"
                  >
                    Abrir Proyector
                  </button>
                  <button
                    onClick={() => handleOpenScreen(`/predicador/${ev.id}`)}
                    className="px-3 py-2.5 rounded-xl bg-amber-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-amber-500 transition-colors"
                  >
                    Abrir Predicador
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 📺 MODAL: MATRIZ DE SALIDAS (Gestión Pro) */}
      {showManager && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-xl flex items-center justify-center z-[100] p-4 animate-in fade-in duration-300">
          <div className="bg-zinc-900 border border-zinc-800 rounded-[2.5rem] w-full max-w-4xl max-h-[90vh] shadow-2xl flex flex-col overflow-hidden">
            <div className="p-8 border-b border-zinc-800 bg-zinc-900/50 flex justify-between items-center">
              <div>
                <h3 className="text-2xl font-black text-white flex items-center gap-3">
                  <Tv className="text-violet-500" size={28} /> Matriz de Salidas
                </h3>
                <p className="text-zinc-500 text-sm font-medium mt-1">Configura tus monitores físicos y el contenido que recibirán.</p>
              </div>
              <button onClick={() => setShowManager(false)} className="p-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 rounded-2xl transition-colors"><X size={24}/></button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 space-y-6">
              {hubFeedback && (
                <div className={`rounded-2xl border px-4 py-3 text-sm font-bold ${
                  hubFeedback.type === 'error'
                    ? 'border-red-500/30 bg-red-500/10 text-red-200'
                    : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                }`}>
                  {hubFeedback.message}
                </div>
              )}

              <div className="flex justify-center">
                <button onClick={detectarPantallas} className="px-6 py-2 bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 rounded-full text-xs font-black uppercase tracking-widest hover:bg-indigo-600/30 transition-all">
                  {availableScreens.length > 0 ? `${availableScreens.length} Monitores Detectados` : 'Escanear Hardware de Video'}
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Object.entries(outputs).map(([id, out]) => (
                  <div key={id} className="bg-zinc-950 border border-zinc-800 rounded-3xl p-5 space-y-4 hover:border-violet-500/30 transition-all group">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <input 
                          type="text"
                          value={outputDrafts[id] ?? out.label ?? ''}
                          onChange={(e) => handleOutputLabelChange(id, e.target.value)}
                          onBlur={() => saveOutputLabel(id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') e.currentTarget.blur();
                            if (e.key === 'Escape') setOutputDrafts(prev => ({ ...prev, [id]: out.label || '' }));
                          }}
                          className="bg-transparent border-none text-lg font-black text-white p-0 focus:ring-0 w-full"
                        />
                        {savingOutputs[id] && (
                          <p className="mt-1 flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-violet-300">
                            <Loader2 size={12} className="animate-spin" /> Guardando
                          </p>
                        )}
                        <div className="flex gap-2 mt-2">
                          {['proyector', 'preacher', 'retorno', 'musicos'].map(t => (
                            <button 
                              key={t} onClick={() => handleUpdateOutput(id, { type: t }, { successMessage: 'Tipo de salida actualizado.' })}
                              className={`px-2 py-1 rounded-md text-[9px] font-black uppercase border ${out.type === t ? 'bg-violet-600 border-violet-500 text-white' : 'border-zinc-800 text-zinc-600'}`}
                            >
                              {t === 'proyector' ? 'Público' : t === 'preacher' ? 'Predicador' : t === 'retorno' ? 'Stage' : 'Banda'}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => handleIdentifyOutput(id)} className="p-2 text-zinc-800 hover:text-blue-500 transition-colors" title="Identificar Pantalla"><Fingerprint size={18}/></button>
                        <button onClick={() => setConfirmModal({ show: true, id, label: out.label })} className="p-2 text-zinc-800 hover:text-red-500 transition-colors"><Trash2 size={18}/></button>
                      </div>
                    </div>

                    <div className="pt-2">
                      <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest block mb-2">Monitor Destino</label>
                      <select 
                        value={out.screenId || ''}
                        onChange={(e) => handleUpdateOutput(id, { screenId: e.target.value }, { successMessage: 'Monitor destino actualizado.' })}
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs font-bold text-zinc-400 outline-none focus:border-indigo-500"
                      >
                        <option value="">Cualquier pantalla (Ventana)</option>
                        {availableScreens.map((s, idx) => (
                          <option key={s.id || idx} value={s.id}>Pantalla {idx + 1} ({s.width}x{s.height})</option>
                        ))}
                      </select>
                    </div>

                    <button 
                      onClick={() => lanzarSalida(id)}
                      className="w-full py-3 bg-zinc-800 hover:bg-white hover:text-zinc-950 rounded-xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                    >
                      <ExternalLink size={14}/> Lanzar a Pantalla
                    </button>
                  </div>
                ))}

                <button 
                  onClick={crearOutput}
                  className="border-2 border-dashed border-zinc-800 rounded-3xl flex flex-col items-center justify-center p-8 text-zinc-600 hover:text-violet-500 hover:border-violet-500/50 transition-all gap-2"
                >
                  <Plus size={32} />
                  <span className="font-black text-xs uppercase">Nueva Salida Virtual</span>
                </button>
              </div>
            </div>
            <div className="p-8 border-t border-zinc-800 flex justify-end">
              <button onClick={() => setShowManager(false)} className="px-10 py-3 bg-violet-600 text-white font-black rounded-2xl hover:bg-violet-500 transition-all">GUARDAR Y SALIR</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmación para eliminar Salida */}
      {confirmModal.show && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[110] p-4 animate-in fade-in">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 max-w-sm w-full shadow-2xl">
            <h3 className="text-xl font-black text-white mb-2">¿Eliminar salida?</h3>
            <p className="text-zinc-500 text-sm mb-6">Vas a eliminar la configuración de <b>{confirmModal.label}</b>. Esta acción es permanente.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmModal({ show: false, id: null, label: '' })} className="flex-1 py-3 bg-zinc-800 text-zinc-300 font-bold rounded-xl">Cancelar</button>
              <button onClick={() => eliminarOutput(confirmModal.id)} className="flex-1 py-3 bg-red-600 text-white font-black rounded-xl">Eliminar</button>
            </div>
          </div>
        </div>
      )}

      {testModal.show && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[110] p-4 animate-in fade-in">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 max-w-sm w-full shadow-2xl">
            <h3 className="text-xl font-black text-white mb-2">Probar pantalla</h3>
            <p className="text-zinc-500 text-sm mb-6">
              Se mostrara una prueba visual temporal en <b>{testModal.label}</b> durante {OUTPUT_SCREEN_TEST_DURATION_MS / 1000} segundos.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setTestModal({ show: false, id: null, label: '' })} className="flex-1 py-3 bg-zinc-800 text-zinc-300 font-bold rounded-xl">Cancelar</button>
              <button onClick={() => handleScreenTest(testModal.id)} className="flex-1 py-3 bg-emerald-600 text-white font-black rounded-xl">Probar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MultimediaHub;
