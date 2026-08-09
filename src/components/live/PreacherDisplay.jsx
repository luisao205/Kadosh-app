import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { addDoc, collection, doc, getDoc, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
import { AlertCircle, ArrowLeft, ArrowRight, BookOpen, Clock3, Lock, MessageSquare, Pause, Play, RotateCcw, Send, ShieldCheck, StickyNote, Video, X } from 'lucide-react';
import { db } from '../../config/firebase';
import { isAdmin, isMultimedia, isOwner, isPastor, isPreacherLegacy } from '../../utils/rolePermissions';
import { useFeedback } from '../ui/FeedbackProvider';
import {
  PREACHER_QUICK_ALERTS,
  PREACHER_REQUEST_STATUS,
  PREACHING_SESSION_STATUS,
  buildDirectPreachingProjectorState,
  buildPreachingProgress,
  createPointRequestPayload,
  createQuickAlertPayload,
  createVerseRequestPayload,
  isPreachingStateFromAction
} from '../../utils/preachingLive';

const LEGACY_PRIVATE_ROLES = ['dueno', 'dueño', 'admin', 'multimedia', 'predicador', 'pastor'];

const getRole = (user = {}) => String(user?.rol || user?.role || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim();

const getTimestamp = (value) => {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return new Date(value).getTime();
  if (value?.toMillis) return value.toMillis();
  if (value?.seconds) return value.seconds * 1000;
  return 0;
};

const formatTime = (value) => {
  const ms = getTimestamp(value);
  if (!ms) return 'Sin actualizar';
  return new Date(ms).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
};

const formatDuration = (milliseconds) => {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

const getText = (...values) => values.find(value => String(value || '').trim()) || '';

const getBlockTitle = (block = {}) => getText(block.title, block.reference, block.content, block.instruction, 'Sin titulo');

const getNoteContent = (block, privateNotes = {}) => {
  if (block?.visibility === 'preacher_only') {
    return privateNotes?.[block.id]?.content || '';
  }
  return block?.content || '';
};

const sortBlocks = (blocks = []) => (Array.isArray(blocks) ? blocks : [])
  .map((block, index) => ({ ...block, order: Number.isFinite(Number(block.order)) ? Number(block.order) : index }))
  .sort((a, b) => a.order - b.order);

const buildPreachingSteps = (blocks = [], privateNotes = {}) => {
  const sorted = sortBlocks(blocks);
  const steps = [];
  let intro = null;
  let current = null;
  let pointCount = 0;

  const ensureIntro = () => {
    if (!intro) {
      intro = {
        id: 'intro',
        kind: 'intro',
        title: 'Introduccion',
        pointNumber: 0,
        subpoints: [],
        verses: [],
        sharedNotes: [],
        privateNotes: [],
        mediaInstructions: [],
        rawBlocks: []
      };
      steps.push(intro);
    }
    return intro;
  };

  sorted.forEach((block) => {
    if (block.type === 'point') {
      pointCount += 1;
      current = {
        id: block.id || `point_${pointCount}`,
        kind: 'point',
        pointNumber: pointCount,
        title: getText(block.title, block.content, `Punto ${pointCount}`),
        content: block.content || '',
        subpoints: [],
        verses: [],
        sharedNotes: [],
        privateNotes: [],
        mediaInstructions: [],
        rawBlocks: [block]
      };
      steps.push(current);
      return;
    }

    const target = current || ensureIntro();
    target.rawBlocks.push(block);

    if (block.type === 'subpoint') {
      target.subpoints.push(block);
      return;
    }

    if (block.type === 'verse') {
      target.verses.push(block);
      return;
    }

    if (block.type === 'note') {
      const content = getNoteContent(block, privateNotes);
      const note = { ...block, content };
      if (block.visibility === 'preacher_only') {
        if (content) target.privateNotes.push(note);
      } else {
        target.sharedNotes.push(note);
      }
      return;
    }

    if (block.type === 'mediaInstruction') {
      target.mediaInstructions.push(block);
    }
  });

  return steps.filter(step => step.kind !== 'intro' || step.rawBlocks.length > 0);
};

const getTimerKey = (preachingId, fallbackId) => `kadosh_preacher_timer_${preachingId || fallbackId || 'legacy'}`;
const getProgressKey = (preachingId, fallbackId) => `kadosh_preacher_progress_${preachingId || fallbackId || 'legacy'}`;

const loadTimer = (key) => {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || 'null');
    if (!parsed || typeof parsed !== 'object') return { elapsedMs: 0, running: false, startedAt: null };
    return {
      elapsedMs: Math.max(0, Number(parsed.elapsedMs) || 0),
      running: Boolean(parsed.running),
      startedAt: parsed.running ? (Number(parsed.startedAt) || Date.now()) : null
    };
  } catch {
    return { elapsedMs: 0, running: false, startedAt: null };
  }
};

const getTargetStatus = (elapsedMs, targetMinutes) => {
  const target = Number(targetMinutes);
  if (!Number.isFinite(target) || target <= 0) return { label: 'Sin objetivo', className: 'text-zinc-400' };
  const remaining = target * 60000 - elapsedMs;
  if (remaining <= 0) return { label: 'Tiempo objetivo superado', className: 'text-red-200' };
  if (remaining <= 5 * 60000) return { label: 'Quedan aprox. 5 min', className: 'text-amber-200' };
  return { label: 'Ritmo normal', className: 'text-emerald-200' };
};

const canOpenLegacy = (user) => LEGACY_PRIVATE_ROLES.includes(getRole(user));
const canPreviewShared = (user) => isOwner(user) || isMultimedia(user) || isAdmin(user);
const canUseV2 = (user, preaching) => {
  if (!preaching) return false;
  if (canPreviewShared(user)) return true;
  if (isPastor(user)) return preaching.preacherType === 'user' && preaching.preacherId === user?.uid;
  if (isPreacherLegacy(user)) return preaching.preacherType === 'user' && preaching.preacherId === user?.uid;
  return false;
};
const canReadPrivateNotes = (user, preaching) => (
  isPastor(user)
  && preaching?.preacherType === 'user'
  && preaching?.preacherId === user?.uid
);

const statusLabel = (status) => ({
  draft: 'Borrador',
  ready: 'Lista',
  live: 'En vivo',
  finished: 'Finalizada'
}[status] || 'Sin estado');

const PreacherDisplay = ({ eventoIdOverride, user }) => {
  const { eventoId: routeEventoId } = useParams();
  const eventoId = eventoIdOverride || routeEventoId;
  const { notify, confirm } = useFeedback();
  const [eventData, setEventData] = useState(null);
  const [eventExists, setEventExists] = useState(false);
  const [preaching, setPreaching] = useState(null);
  const [preachingError, setPreachingError] = useState('');
  const [legacyState, setLegacyState] = useState(null);
  const [privateNotes, setPrivateNotes] = useState({});
  const [requests, setRequests] = useState([]);
  const [preachingStatus, setPreachingStatus] = useState(null);
  const [projectorState, setProjectorState] = useState(null);
  const [isProjectingDirect, setIsProjectingDirect] = useState(false);
  const [isChangingSession, setIsChangingSession] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [timer, setTimer] = useState({ elapsedMs: 0, running: false, startedAt: null });
  const [now, setNow] = useState(Date.now());

  const preachingId = eventData?.predicaId || (!eventExists ? eventoId : '');
  const timerKey = getTimerKey(preachingId, eventoId);
  const progressKey = getProgressKey(preachingId, eventoId);
  const isV2 = Boolean(preachingId && preaching);
  const hasV2Access = canUseV2(user, preaching);
  const hasPrivateAccess = canReadPrivateNotes(user, preaching);
  const canRequestProjection = hasPrivateAccess && Boolean(eventData?.id) && preaching?.eventId === eventData?.id;
  const canOperateLive = canRequestProjection;
  const isLiveSession = preachingStatus?.active === true && preachingStatus?.isLive === true && preachingStatus?.sessionStatus !== PREACHING_SESSION_STATUS.FINISHED;
  const pastorProjectionActive = projectorState?.type === 'preaching'
    && projectorState?.sourceActor === 'pastor'
    && projectorState?.actorUid === user?.uid
    && projectorState?.predicaId === preachingId;

  useEffect(() => {
    if (!eventoId) return undefined;
    const eventRef = doc(db, 'eventos', eventoId);
    const unsub = onSnapshot(eventRef, (snap) => {
      setEventExists(snap.exists());
      setEventData(snap.exists() ? { id: snap.id, ...snap.data() } : null);
    }, (error) => {
      console.warn('No se pudo cargar el evento para Modo Predicador:', error);
      setEventExists(false);
      setEventData(null);
    });
    return () => unsub();
  }, [eventoId]);

  useEffect(() => {
    setPreaching(null);
    setPrivateNotes({});
    setPreachingError('');
    if (!preachingId) return undefined;

    const preachingRef = doc(db, 'predicas', preachingId);
    const unsub = onSnapshot(preachingRef, (snap) => {
      if (!snap.exists()) {
        setPreaching(null);
        return;
      }
      setPreaching({ id: snap.id, ...snap.data() });
    }, (error) => {
      console.warn('No se pudo cargar la predica:', error);
      setPreachingError('No se pudo cargar la predica.');
      notify('No se pudo cargar la predica.', { type: 'error' });
    });
    return () => unsub();
  }, [notify, preachingId]);

  useEffect(() => {
    setPrivateNotes({});
    if (!preachingId || !hasPrivateAccess) return undefined;

    const privateRef = doc(db, 'predicas', preachingId, 'private', 'preacher');
    const unsub = onSnapshot(privateRef, (snap) => {
      setPrivateNotes(snap.exists() ? (snap.data().notes || {}) : {});
    }, (error) => {
      console.warn('No se pudo cargar notas privadas del Pastor:', error);
      notify('No se pudieron cargar las notas privadas del Pastor.', { type: 'warning' });
      setPrivateNotes({});
    });
    return () => unsub();
  }, [hasPrivateAccess, notify, preachingId]);

  useEffect(() => {
    setRequests([]);
    if (!eventData?.id || !preachingId || !hasV2Access) return undefined;
    const requestsQuery = query(
      collection(db, 'eventos', eventData.id, 'preacherRequests'),
      where('predicaId', '==', preachingId),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(requestsQuery, (snap) => {
      setRequests(snap.docs.map(item => ({ id: item.id, ...item.data() })));
    }, (error) => {
      console.warn('No se pudieron cargar solicitudes del Pastor:', error);
    });
    return () => unsub();
  }, [eventData?.id, hasV2Access, preachingId]);

  useEffect(() => {
    setPreachingStatus(null);
    setProjectorState(null);
    if (!eventData?.id || !preachingId || !hasV2Access) return undefined;
    const unsubStatus = onSnapshot(doc(db, 'eventos', eventData.id, 'preachingStatus', preachingId), (snap) => {
      setPreachingStatus(snap.exists() ? { id: snap.id, ...snap.data() } : null);
    }, (error) => {
      console.warn('No se pudo cargar la sesion de predica:', error);
    });
    const unsubEvent = onSnapshot(doc(db, 'eventos', eventData.id), (snap) => {
      setProjectorState(snap.exists() ? (snap.data().projectorState || null) : null);
    }, (error) => {
      console.warn('No se pudo cargar estado del proyector:', error);
    });
    return () => {
      unsubStatus();
      unsubEvent();
    };
  }, [eventData?.id, hasV2Access, preachingId]);

  useEffect(() => {
    if (preachingId || !canOpenLegacy(user) || !eventoId) return undefined;
    const unsub = onSnapshot(doc(db, 'eventos', eventoId, 'private', 'preacher'), (snap) => {
      setLegacyState(snap.exists() ? snap.data() : null);
    });
    return () => unsub();
  }, [eventoId, preachingId, user]);

  useEffect(() => {
    setCurrentIndex(0);
    if (!preachingId) return;
    const saved = Number(window.localStorage.getItem(progressKey));
    setCurrentIndex(Number.isFinite(saved) && saved >= 0 ? saved : 0);
    setTimer(loadTimer(timerKey));
  }, [preachingId, progressKey, timerKey]);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const elapsedMs = timer.running && timer.startedAt
    ? timer.elapsedMs + Math.max(0, now - timer.startedAt)
    : timer.elapsedMs;

  useEffect(() => {
    if (!timerKey) return;
    window.localStorage.setItem(timerKey, JSON.stringify(timer));
  }, [timer, timerKey]);

  const steps = useMemo(() => buildPreachingSteps(preaching?.blocks || [], privateNotes), [preaching?.blocks, privateNotes]);
  const safeIndex = Math.min(Math.max(0, currentIndex), Math.max(0, steps.length - 1));
  const currentStep = steps[safeIndex] || null;
  const previousStep = safeIndex > 0 ? steps[safeIndex - 1] : null;
  const nextStep = safeIndex < steps.length - 1 ? steps[safeIndex + 1] : null;
  const progressPercent = steps.length ? ((safeIndex + 1) / steps.length) * 100 : 0;
  const targetStatus = getTargetStatus(elapsedMs, preaching?.targetDurationMinutes);

  useEffect(() => {
    if (!steps.length || safeIndex === currentIndex) setCurrentIndex(safeIndex);
  }, [currentIndex, safeIndex, steps.length]);

  useEffect(() => {
    if (!preachingId || !steps.length) return;
    window.localStorage.setItem(progressKey, String(safeIndex));
  }, [preachingId, progressKey, safeIndex, steps.length]);

  useEffect(() => {
    if (!canRequestProjection || !eventData?.id || !currentStep || !steps.length || !isLiveSession) return;
    const payload = buildPreachingProgress({
      predicaId: preachingId,
      pastor: user,
      currentIndex: safeIndex,
      totalSteps: steps.length,
      currentTitle: currentStep.title,
      isLive: true,
      active: true,
      sessionStatus: PREACHING_SESSION_STATUS.LIVE,
      startedAt: preachingStatus?.startedAt || Date.now()
    });
    setDoc(doc(db, 'eventos', eventData.id, 'preachingStatus', preachingId), payload, { merge: true }).catch((error) => {
      console.warn('No se pudo sincronizar progreso del Pastor:', error);
    });
  }, [canRequestProjection, currentStep, eventData?.id, isLiveSession, preachingId, preachingStatus?.startedAt, safeIndex, steps.length, user]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (!isV2 || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === 'ArrowLeft') setCurrentIndex(index => Math.max(0, index - 1));
      if (event.key === 'ArrowRight') setCurrentIndex(index => Math.min(Math.max(0, steps.length - 1), index + 1));
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isV2, steps.length]);

  const startTimer = () => {
    setTimer(prev => prev.running ? prev : { ...prev, running: true, startedAt: Date.now() });
  };

  const pauseTimer = () => {
    setTimer(prev => prev.running
      ? { elapsedMs: prev.elapsedMs + Math.max(0, Date.now() - prev.startedAt), running: false, startedAt: null }
      : prev);
  };

  const resetTimer = async () => {
    const ok = await confirm({
      title: 'Reiniciar cronometro',
      message: 'Esto reiniciara el tiempo local de esta predica en este dispositivo.',
      confirmLabel: 'Reiniciar',
      cancelLabel: 'Cancelar',
      variant: 'danger'
    });
    if (!ok) return;
    setTimer({ elapsedMs: 0, running: false, startedAt: null });
  };

  const goPrevious = () => setCurrentIndex(index => Math.max(0, index - 1));
  const goNext = () => setCurrentIndex(index => Math.min(Math.max(0, steps.length - 1), index + 1));

  const startLivePreaching = async () => {
    if (!canOperateLive || !eventData?.id || !preachingId || !currentStep) {
      notify('Solo el Pastor asignado puede iniciar una predica asociada a un evento.', { type: 'warning' });
      return;
    }
    if (isChangingSession) return;
    setIsChangingSession(true);
    try {
      const startedAt = preachingStatus?.startedAt || Date.now();
      await setDoc(doc(db, 'eventos', eventData.id, 'preachingStatus', preachingId), buildPreachingProgress({
        predicaId: preachingId,
        pastor: user,
        currentIndex: safeIndex,
        totalSteps: steps.length,
        currentTitle: currentStep.title,
        isLive: true,
        active: true,
        startedAt,
        sessionStatus: PREACHING_SESSION_STATUS.LIVE
      }), { merge: true });
      if (!timer.running && timer.elapsedMs === 0) startTimer();
      notify('Predica iniciada. Control directo habilitado.', { type: 'success' });
    } catch (error) {
      console.error('Error iniciando predica:', error);
      notify('No se pudo iniciar la predica.', { type: 'error' });
    } finally {
      setIsChangingSession(false);
    }
  };

  const finishLivePreaching = async () => {
    if (!canOperateLive || !eventData?.id || !preachingId || !isLiveSession) return;
    const ok = await confirm({
      title: 'Finalizar predica',
      message: 'Se detendra la sesion en vivo del Pastor. La predica y sus solicitudes se conservaran.',
      confirmLabel: 'Finalizar',
      cancelLabel: 'Cancelar',
      variant: 'danger'
    });
    if (!ok) return;
    setIsChangingSession(true);
    try {
      pauseTimer();
      await setDoc(doc(db, 'eventos', eventData.id, 'preachingStatus', preachingId), {
        predicaId: preachingId,
        pastorUid: user?.uid || null,
        pastorName: user?.nombre || user?.displayName || user?.email || 'Pastor',
        active: false,
        isLive: false,
        sessionStatus: PREACHING_SESSION_STATUS.FINISHED,
        finishedAt: Date.now(),
        updatedAt: Date.now()
      }, { merge: true });
      notify('Predica finalizada.', { type: 'success' });
    } catch (error) {
      console.error('Error finalizando predica:', error);
      notify('No se pudo finalizar la predica.', { type: 'error' });
    } finally {
      setIsChangingSession(false);
    }
  };

  const writePreachingProjection = async (payload) => {
    if (!canOperateLive || !isLiveSession || !eventData?.id) {
      notify('Inicia la predica para proyectar directamente.', { type: 'warning' });
      return;
    }
    if (isProjectingDirect) return;
    setIsProjectingDirect(true);
    try {
      const eventRef = doc(db, 'eventos', eventData.id);
      const eventSnap = await getDoc(eventRef);
      const previousProjectorState = eventSnap.exists() ? (eventSnap.data().projectorState || null) : null;
      const nextState = buildDirectPreachingProjectorState({
        ...payload,
        predicaId: preachingId,
        pastor: user,
        stepIndex: safeIndex,
        previousProjectorState
      });
      await setDoc(eventRef, {
        projectorState: nextState,
        proyectorSlide: null,
        proyectorMedia: null,
        proyectorLogo: false,
        proyectorApagado: false,
        proyectorFondoMedia: null,
        proyectorSongId: null,
        proyectorSlideIndex: -1,
        proyectorNextSlide: null,
        proyectorNextSong: null
      }, { merge: true });
      notify('Contenido proyectado.', { type: 'success' });
    } catch (error) {
      console.error('Error proyectando desde Pastor:', error);
      notify('No se pudo proyectar el contenido.', { type: 'error' });
    } finally {
      setIsProjectingDirect(false);
    }
  };

  const projectCurrentPointNow = () => writePreachingProjection({
    preachingType: 'point',
    title: currentStep?.title || 'Punto de predica',
    reference: currentStep?.pointNumber ? `Punto ${currentStep.pointNumber}` : 'Punto',
    content: currentStep?.title || '',
    blockId: currentStep?.id || ''
  });

  const projectVerseNow = (verse) => writePreachingProjection({
    preachingType: 'verse',
    title: verse?.reference || 'Versiculo',
    reference: verse?.reference || '',
    translation: verse?.translation || '',
    content: verse?.text || '',
    blockId: verse?.id || ''
  });

  const clearOwnPreachingProjection = async () => {
    if (!eventData?.id || !projectorState?.actionId) return;
    setIsProjectingDirect(true);
    try {
      const eventRef = doc(db, 'eventos', eventData.id);
      const eventSnap = await getDoc(eventRef);
      const current = eventSnap.exists() ? eventSnap.data().projectorState : null;
      if (!isPreachingStateFromAction(current, projectorState.actionId)) {
        notify('La pantalla cambio desde Multimedia.', { type: 'info' });
        return;
      }
      const previous = current?.previousProjectorState || null;
      await setDoc(eventRef, {
        projectorState: previous || {
          type: 'clearPreaching',
          title: 'Predica quitada',
          content: '',
          media: null,
          predicaId: preachingId,
          background: null,
          updatedAt: Date.now(),
          sourceActor: 'pastor',
          actorUid: user?.uid || null,
          actorName: user?.nombre || user?.email || 'Pastor'
        },
        proyectorSlide: previous?.type === 'lyrics' ? eventData?.proyectorSlide || null : null,
        proyectorMedia: previous?.type === 'media' ? (previous.media || null) : null,
        proyectorApagado: previous?.type === 'blackout',
        proyectorLogo: previous?.type === 'logo'
      }, { merge: true });
      notify(previous ? 'Contenido anterior restaurado.' : 'Contenido de predica quitado.', { type: 'success' });
    } catch (error) {
      console.error('Error quitando proyeccion del Pastor:', error);
      notify('No se pudo quitar el contenido.', { type: 'error' });
    } finally {
      setIsProjectingDirect(false);
    }
  };

  const findRequestForBlock = (blockId) => requests.find(request => (
    request.blockId === blockId
    && request.predicaId === preachingId
    && request.requestedBy === user?.uid
    && request.status !== PREACHER_REQUEST_STATUS.CANCELLED
  ));

  const findPendingRequestForBlock = (blockId) => requests.find(request => (
    request.blockId === blockId
    && request.predicaId === preachingId
    && request.requestedBy === user?.uid
    && request.status === PREACHER_REQUEST_STATUS.PENDING
  ));

  const sendPreacherRequest = async (payload) => {
    if (!canRequestProjection) {
      notify('Solo el Pastor asignado puede enviar solicitudes desde esta predica.', { type: 'warning' });
      return;
    }
    if (payload.blockId && findPendingRequestForBlock(payload.blockId)) {
      notify('Ya existe una solicitud pendiente para este contenido.', { type: 'info' });
      return;
    }
    try {
      await addDoc(collection(db, 'eventos', eventData.id, 'preacherRequests'), {
        ...payload,
        requestedBy: user.uid,
        preacherName: user?.nombre || user?.email || 'Pastor',
        status: PREACHER_REQUEST_STATUS.PENDING,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      notify('Solicitud enviada a Multimedia.', { type: 'success' });
    } catch (error) {
      console.error('Error enviando solicitud del Pastor:', error);
      notify('No se pudo enviar la solicitud.', { type: 'error' });
    }
  };

  const requestVerse = (verse) => sendPreacherRequest(createVerseRequestPayload({
    eventoId: eventData.id,
    predicaId: preachingId,
    block: verse,
    preacher: user,
    step: { ...currentStep, index: safeIndex }
  }));

  const requestPoint = () => sendPreacherRequest(createPointRequestPayload({
    eventoId: eventData.id,
    predicaId: preachingId,
    step: { ...currentStep, index: safeIndex },
    preacher: user
  }));

  const sendQuickAlert = (alert) => sendPreacherRequest(createQuickAlertPayload({
    eventoId: eventData.id,
    predicaId: preachingId,
    alert,
    preacher: user,
    step: { ...currentStep, index: safeIndex }
  }));

  const cancelRequest = async (request) => {
    if (!request?.id || request.status !== PREACHER_REQUEST_STATUS.PENDING || request.requestedBy !== user?.uid) return;
    try {
      await updateDoc(doc(db, 'eventos', eventData.id, 'preacherRequests', request.id), {
        status: PREACHER_REQUEST_STATUS.CANCELLED,
        cancelledAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      notify('Solicitud cancelada.', { type: 'success' });
    } catch (error) {
      console.error('Error cancelando solicitud:', error);
      notify('No se pudo cancelar la solicitud.', { type: 'error' });
    }
  };

  const getRequestLabel = (request) => {
    if (!request) return 'Solicitar proyeccion';
    if (request.status === PREACHER_REQUEST_STATUS.PENDING) return 'Solicitud pendiente';
    if (request.status === PREACHER_REQUEST_STATUS.PROJECTED) return 'Proyectado';
    if (request.status === PREACHER_REQUEST_STATUS.IGNORED) return 'No proyectada';
    return 'Solicitar de nuevo';
  };

  if (!canOpenLegacy(user) && !isPastor(user) && !canPreviewShared(user)) {
    return (
      <div className="fixed inset-0 bg-zinc-950 text-white flex items-center justify-center p-8">
        <div className="max-w-lg text-center rounded-3xl border border-red-500/30 bg-red-500/10 p-8">
          <Lock className="mx-auto text-red-300 mb-4" size={42} />
          <h1 className="text-2xl font-black mb-2">Pantalla privada bloqueada</h1>
          <p className="text-sm text-red-100/80 font-medium">Esta salida solo puede abrirse con rol Pastor asignado o equipo autorizado.</p>
        </div>
      </div>
    );
  }

  if (preachingId && preaching && !hasV2Access) {
    return (
      <div className="fixed inset-0 bg-zinc-950 text-white flex items-center justify-center p-8">
        <div className="max-w-lg text-center rounded-3xl border border-amber-500/30 bg-amber-500/10 p-8">
          <Lock className="mx-auto text-amber-200 mb-4" size={42} />
          <h1 className="text-2xl font-black mb-2">Predica no asignada</h1>
          <p className="text-sm text-amber-50/80 font-medium">Solo el Pastor asignado puede usar esta vista completa. El contenido privado no fue solicitado.</p>
        </div>
      </div>
    );
  }

  if (isV2) {
    return (
      <div className="fixed inset-0 overflow-hidden bg-[#06070b] text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.14),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(124,58,237,0.16),transparent_30%)] pointer-events-none" />
        <div className="relative flex h-dvh flex-col gap-3 overflow-hidden px-4 pb-4 pt-[calc(env(safe-area-inset-top)+14px)] sm:px-6 sm:pb-6 lg:px-8">
          <header className="shrink-0 rounded-[1.6rem] border border-white/10 bg-zinc-950/70 p-4 shadow-2xl shadow-black/30 backdrop-blur-xl">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-amber-400/25 bg-amber-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-amber-200">Modo Predicador</span>
                  <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${isLiveSession ? 'border-emerald-400/25 bg-emerald-500/10 text-emerald-200' : 'border-blue-400/25 bg-blue-500/10 text-blue-200'}`}>
                    {isLiveSession ? 'Predicando' : 'Modo ensayo'}
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-zinc-400">{statusLabel(preaching.status)}</span>
                  {hasPrivateAccess && <span className="rounded-full border border-emerald-400/25 bg-emerald-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-200">Solo Pastor activo</span>}
                </div>
                <h1 className="truncate text-2xl font-black tracking-tight sm:text-4xl lg:text-5xl">{preaching.title || 'Predica sin titulo'}</h1>
                <p className="mt-2 truncate text-sm font-bold text-zinc-400">
                  {[preaching.topic, preaching.mainReference, eventData?.titulo].filter(Boolean).join(' / ') || 'Sin tema ni referencia'}
                </p>
              </div>

              <div className="grid grid-cols-[1fr_auto] gap-3 sm:grid-cols-[auto_auto]">
                {canOperateLive && (
                  <div className="col-span-2 flex flex-wrap justify-end gap-2">
                    {!isLiveSession ? (
                      <button type="button" onClick={startLivePreaching} disabled={isChangingSession || !eventData?.id} className="rounded-2xl bg-emerald-600 px-4 py-3 text-xs font-black uppercase tracking-wide text-white disabled:opacity-50">
                        {preachingStatus?.startedAt ? 'Continuar predica' : 'Iniciar predica'}
                      </button>
                    ) : (
                      <button type="button" onClick={finishLivePreaching} disabled={isChangingSession} className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs font-black uppercase tracking-wide text-red-100 disabled:opacity-50">
                        Finalizar predica
                      </button>
                    )}
                    {pastorProjectionActive && (
                      <button type="button" onClick={clearOwnPreachingProjection} disabled={isProjectingDirect} className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs font-black uppercase tracking-wide text-amber-100 disabled:opacity-50">
                        <span className="inline-flex items-center gap-2"><X size={14} /> Quitar de pantalla</span>
                      </button>
                    )}
                  </div>
                )}
                <div className="rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-right">
                  <p className="flex items-center justify-end gap-1 text-[10px] font-black uppercase tracking-widest text-zinc-500"><Clock3 size={12} /> Tiempo</p>
                  <p className="font-mono text-3xl font-black sm:text-4xl">{formatDuration(elapsedMs)}</p>
                  <p className={`text-[11px] font-black uppercase ${targetStatus.className}`}>
                    {preaching.targetDurationMinutes ? `${targetStatus.label} / ${preaching.targetDurationMinutes} min` : targetStatus.label}
                  </p>
                </div>
                <div className="flex rounded-2xl border border-white/10 bg-black/35 p-2">
                  <button type="button" onClick={timer.running ? pauseTimer : startTimer} className="rounded-xl px-3 py-2 text-emerald-100 hover:bg-emerald-500/10" aria-label={timer.running ? 'Pausar cronometro' : 'Iniciar cronometro'}>
                    {timer.running ? <Pause size={22} /> : <Play size={22} />}
                  </button>
                  <button type="button" onClick={resetTimer} className="rounded-xl px-3 py-2 text-amber-100 hover:bg-amber-500/10" aria-label="Reiniciar cronometro">
                    <RotateCcw size={22} />
                  </button>
                </div>
              </div>
            </div>
          </header>

          {steps.length === 0 ? (
            <main className="flex min-h-0 flex-1 items-center justify-center rounded-[2rem] border border-white/10 bg-zinc-950/55 p-8 text-center">
              <div>
                <BookOpen className="mx-auto mb-4 text-zinc-600" size={52} />
                <h2 className="text-2xl font-black">Esta predica todavia no tiene puntos preparados.</h2>
                <p className="mt-2 text-sm font-bold text-zinc-500">Cuando agregues puntos al bosquejo apareceran aqui.</p>
              </div>
            </main>
          ) : (
            <main className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
              <section className="flex min-h-0 flex-col rounded-[2rem] border border-violet-400/20 bg-violet-500/10 p-4 shadow-2xl shadow-black/25 sm:p-6">
                <div className="mb-4 shrink-0">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="text-[11px] font-black uppercase tracking-[0.28em] text-violet-200">
                      {currentStep.kind === 'intro' ? 'Introduccion' : `Punto ${currentStep.pointNumber} de ${steps.filter(step => step.kind === 'point').length}`}
                    </p>
                    <p className="text-xs font-black uppercase text-zinc-400">{safeIndex + 1} / {steps.length}</p>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-black/35">
                    <div className="h-full rounded-full bg-violet-400 transition-all" style={{ width: `${progressPercent}%` }} />
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                  {canOperateLive && (
                    <div className="mb-4 rounded-2xl border border-white/10 bg-black/25 p-3">
                      <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">En pantalla</p>
                      <p className="mt-1 truncate text-sm font-black text-white">
                        {projectorState?.type === 'preaching'
                          ? [projectorState.reference || projectorState.title, projectorState.translation].filter(Boolean).join(' · ')
                          : projectorState?.type === 'lyrics'
                            ? 'Cancion controlada por Multimedia'
                            : projectorState?.type
                              ? `${projectorState.title || projectorState.type} controlado por Multimedia`
                              : 'Sin contenido de predica en pantalla'}
                      </p>
                      {projectorState?.actorName && (
                        <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-zinc-500">Enviado por: {projectorState.actorName}</p>
                      )}
                    </div>
                  )}
                  <h2 className="text-4xl font-black leading-tight tracking-tight sm:text-6xl lg:text-7xl">{currentStep.title}</h2>
                  {currentStep.content && currentStep.content !== currentStep.title && (
                    <p className="mt-4 whitespace-pre-wrap text-xl font-bold leading-relaxed text-violet-50/90 sm:text-2xl">{currentStep.content}</p>
                  )}
                  {canRequestProjection && currentStep.kind === 'point' && (
                    <div className="mt-5 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={projectCurrentPointNow}
                        disabled={!isLiveSession || isProjectingDirect}
                        className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2 text-xs font-black uppercase tracking-wide text-white hover:bg-emerald-500 disabled:opacity-45"
                      >
                        <Video size={15} /> Proyectar punto
                      </button>
                      {(() => {
                        const request = findRequestForBlock(currentStep.id);
                        const pending = request?.status === PREACHER_REQUEST_STATUS.PENDING;
                        return (
                          <>
                            <button
                              type="button"
                              onClick={() => requestPoint()}
                              disabled={pending}
                              className={`inline-flex min-h-11 items-center gap-2 rounded-2xl px-4 py-2 text-xs font-black uppercase tracking-wide ${pending ? 'border border-amber-400/25 bg-amber-500/10 text-amber-100' : 'border border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10'}`}
                            >
                              <Send size={15} /> {getRequestLabel(request)}
                            </button>
                            {pending && (
                              <button type="button" onClick={() => cancelRequest(request)} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-black uppercase text-zinc-200">
                                Cancelar solicitud
                              </button>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  )}

                  <div className="mt-6 grid gap-4">
                    {currentStep.subpoints.length > 0 && (
                      <div className="rounded-3xl border border-white/10 bg-black/25 p-4">
                        <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-zinc-400">Subpuntos</p>
                        <div className="space-y-3">
                          {currentStep.subpoints.map((item, index) => (
                            <div key={item.id || index} className="rounded-2xl bg-white/5 p-3">
                              <p className="text-base font-black text-white">{item.title || `Subpunto ${index + 1}`}</p>
                              {item.content && <p className="mt-1 whitespace-pre-wrap text-sm font-semibold leading-relaxed text-zinc-300">{item.content}</p>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {currentStep.verses.length > 0 && (
                      <div className="rounded-3xl border border-blue-400/20 bg-blue-500/10 p-4">
                        <p className="mb-3 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-blue-200"><BookOpen size={14} /> Versiculos</p>
                        <div className="space-y-3">
                          {currentStep.verses.map((verse, index) => (
                            <div key={verse.id || index} className="rounded-2xl bg-black/25 p-3">
                              <p className="text-base font-black text-blue-50">
                                {[verse.reference, verse.translation].filter(Boolean).join(' · ') || 'Referencia sin definir'}
                              </p>
                              {verse.text && <p className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-relaxed text-blue-50/85">{verse.text}</p>}
                              {canRequestProjection && (
                                <div className="mt-3 flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    onClick={() => projectVerseNow(verse)}
                                    disabled={!isLiveSession || isProjectingDirect}
                                    className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-white hover:bg-emerald-500 disabled:opacity-45"
                                  >
                                    <Video size={13} /> Proyectar ahora
                                  </button>
                                  {(() => {
                                    const request = findRequestForBlock(verse.id);
                                    const pending = request?.status === PREACHER_REQUEST_STATUS.PENDING;
                                    return (
                                      <>
                                        <button
                                          type="button"
                                          onClick={() => requestVerse(verse)}
                                          disabled={pending}
                                          className={`inline-flex min-h-10 items-center gap-2 rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-wide ${pending ? 'border border-amber-400/25 bg-amber-500/10 text-amber-100' : 'border border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10'}`}
                                        >
                                          <Send size={13} /> {getRequestLabel(request)}
                                        </button>
                                        {pending && (
                                          <button type="button" onClick={() => cancelRequest(request)} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-black uppercase text-zinc-200">
                                            Cancelar
                                          </button>
                                        )}
                                      </>
                                    );
                                  })()}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {currentStep.sharedNotes.length > 0 && (
                      <div className="rounded-3xl border border-zinc-500/20 bg-zinc-900/60 p-4">
                        <p className="mb-3 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-zinc-400"><StickyNote size={14} /> Notas</p>
                        <div className="space-y-2">
                          {currentStep.sharedNotes.map((note, index) => (
                            <p key={note.id || index} className="rounded-2xl bg-white/5 p-3 text-sm font-semibold leading-relaxed text-zinc-200 whitespace-pre-wrap">{note.content || 'Nota sin contenido'}</p>
                          ))}
                        </div>
                      </div>
                    )}

                    {currentStep.privateNotes.length > 0 && (
                      <div className="rounded-3xl border border-amber-400/25 bg-amber-500/10 p-4">
                        <p className="mb-3 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-amber-200"><Lock size={14} /> Solo yo</p>
                        <div className="space-y-2">
                          {currentStep.privateNotes.map((note, index) => (
                            <p key={note.id || index} className="rounded-2xl bg-black/25 p-3 text-sm font-bold leading-relaxed text-amber-50 whitespace-pre-wrap">{note.content}</p>
                          ))}
                        </div>
                      </div>
                    )}

                    {currentStep.mediaInstructions.length > 0 && (
                      <div className="rounded-3xl border border-cyan-400/20 bg-cyan-500/10 p-4">
                        <p className="mb-3 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-cyan-200"><Video size={14} /> Multimedia</p>
                        <div className="space-y-2">
                          {currentStep.mediaInstructions.map((item, index) => (
                            <p key={item.id || index} className="rounded-2xl bg-black/25 p-3 text-sm font-bold leading-relaxed text-cyan-50 whitespace-pre-wrap">{item.instruction || 'Indicacion multimedia sin detalle'}</p>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </section>

              <aside className="grid min-h-0 gap-3 lg:grid-rows-[auto_1fr_auto]">
                <div className="rounded-[1.6rem] border border-white/10 bg-zinc-950/65 p-4">
                  <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-zinc-500">Anterior</p>
                  <p className="truncate text-sm font-black text-zinc-300">{previousStep ? getBlockTitle(previousStep) : 'Inicio de la predica'}</p>
                </div>
                <div className="rounded-[1.6rem] border border-white/10 bg-zinc-950/65 p-4">
                  <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-emerald-300">Siguiente</p>
                  <p className="text-xl font-black leading-snug text-white">{nextStep ? getBlockTitle(nextStep) : 'Fin de la predica'}</p>
                  {eventData?.titulo && (
                    <p className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-3 text-xs font-bold text-zinc-400">
                      Culto asociado: {eventData.titulo}
                    </p>
                  )}
                  {legacyState?.mensajesInternos && (
                    <div className="mt-4 rounded-2xl border border-cyan-400/20 bg-cyan-500/10 p-3">
                      <p className="text-[10px] font-black uppercase tracking-widest text-cyan-200">Aviso multimedia</p>
                      <p className="mt-1 text-sm font-bold text-cyan-50">{legacyState.mensajesInternos}</p>
                    </div>
                  )}
                  {legacyState?.indicaciones && (
                    <div className="mt-3 rounded-2xl border border-amber-400/20 bg-amber-500/10 p-3">
                      <p className="text-[10px] font-black uppercase tracking-widest text-amber-200">Indicacion</p>
                      <p className="mt-1 text-sm font-bold text-amber-50">{legacyState.indicaciones}</p>
                    </div>
                  )}
                  {canRequestProjection && (
                    <div className="mt-4 grid grid-cols-1 gap-2">
                      <button type="button" onClick={() => sendQuickAlert(PREACHER_QUICK_ALERTS.FINISHING)} className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-xs font-black uppercase tracking-wide text-emerald-100">
                        Voy terminando
                      </button>
                      <button type="button" onClick={() => sendQuickAlert(PREACHER_QUICK_ALERTS.FIVE_MORE)} className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-xs font-black uppercase tracking-wide text-amber-100">
                        Necesito 5 min mas
                      </button>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <button type="button" onClick={goPrevious} disabled={safeIndex === 0} className="flex min-h-14 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm font-black uppercase text-white disabled:opacity-35">
                    <ArrowLeft size={18} /> Anterior
                  </button>
                  <button type="button" onClick={goNext} disabled={!nextStep} className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-violet-600 px-4 py-4 text-sm font-black uppercase text-white disabled:opacity-35">
                    Siguiente <ArrowRight size={18} />
                  </button>
                </div>
              </aside>
            </main>
          )}
        </div>
      </div>
    );
  }

  if (preachingError) {
    return (
      <div className="fixed inset-0 bg-zinc-950 text-white flex items-center justify-center p-8">
        <div className="max-w-lg text-center rounded-3xl border border-red-500/30 bg-red-500/10 p-8">
          <AlertCircle className="mx-auto text-red-300 mb-4" size={42} />
          <h1 className="text-2xl font-black mb-2">No se pudo cargar</h1>
          <p className="text-sm text-red-100/80 font-medium">{preachingError}</p>
        </div>
      </div>
    );
  }

  if (!legacyState) {
    return (
      <div className="fixed inset-0 bg-zinc-950 text-zinc-600 flex items-center justify-center p-10">
        <div className="text-center">
          <ShieldCheck className="mx-auto mb-5 text-amber-500/50" size={54} />
          <p className="text-5xl font-black tracking-tight mb-3">PREDICADOR</p>
          <p className="text-xs font-black uppercase tracking-[0.4em]">Esperando predica asociada o contenido legacy</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-[#080a0f] text-white overflow-hidden p-5 md:p-8">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.12),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(14,165,233,0.10),transparent_28%)] pointer-events-none" />
      <div className="relative h-full grid grid-rows-[auto_1fr_auto] gap-5">
        <header className="flex items-start justify-between gap-5 border-b border-white/10 pb-5">
          <div className="min-w-0">
            <div className="flex items-center gap-3 mb-3">
              <span className="px-3 py-1 rounded-full bg-amber-500/15 border border-amber-400/30 text-amber-200 text-[10px] font-black uppercase tracking-[0.28em]">Legacy privado</span>
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Actualizado {formatTime(legacyState.updatedAt)}</span>
            </div>
            <h1 className="text-4xl md:text-6xl font-black tracking-tight truncate">{legacyState.tema || 'Tema sin definir'}</h1>
          </div>
        </header>

        <main className="grid grid-cols-1 lg:grid-cols-[1.15fr_0.85fr] gap-5 min-h-0">
          <section className="rounded-[2rem] border border-violet-500/30 bg-violet-500/10 p-7 flex flex-col justify-center shadow-[0_25px_80px_rgba(0,0,0,0.35)]">
            <p className="text-[11px] font-black uppercase tracking-[0.35em] text-violet-300 mb-5">Punto actual</p>
            <h2 className="text-5xl md:text-7xl xl:text-8xl font-black leading-[1.03]">{legacyState.puntoActual || 'Sin punto actual'}</h2>
            <div className="mt-8 rounded-3xl bg-black/30 border border-white/10 p-5">
              <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-2 flex items-center gap-2"><ArrowRight size={14} /> Siguiente punto</p>
              <p className="text-2xl md:text-4xl font-bold text-zinc-200">{legacyState.siguientePunto || 'Sin siguiente punto'}</p>
            </div>
          </section>
          <section className="grid grid-rows-[0.9fr_1.1fr] gap-5 min-h-0">
            <div className="rounded-[2rem] border border-blue-500/20 bg-blue-500/10 p-6 overflow-hidden shadow-2xl">
              <p className="text-[11px] font-black uppercase tracking-[0.25em] text-blue-300 mb-4 flex items-center gap-2"><BookOpen size={16} /> Versiculo actual</p>
              <p className="text-2xl md:text-4xl font-black leading-snug whitespace-pre-wrap">{legacyState.versiculoActual || 'Sin versiculo'}</p>
            </div>
            <div className="rounded-[2rem] border border-amber-500/25 bg-amber-500/10 p-6 overflow-hidden shadow-2xl">
              <p className="text-[11px] font-black uppercase tracking-[0.25em] text-amber-300 mb-4 flex items-center gap-2"><StickyNote size={16} /> Notas privadas legacy</p>
              <p className="text-xl md:text-3xl font-bold leading-snug whitespace-pre-wrap text-amber-50">{legacyState.notasPrivadas || 'Sin notas privadas'}</p>
            </div>
          </section>
        </main>

        <footer className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-2xl bg-cyan-500/10 border border-cyan-400/20 px-5 py-4 flex items-start gap-3">
            <MessageSquare className="text-cyan-300 shrink-0 mt-1" size={22} />
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-cyan-300 mb-1">Mensaje interno</p>
              <p className="text-xl md:text-2xl font-bold text-cyan-50">{legacyState.mensajesInternos || 'Sin mensajes internos'}</p>
            </div>
          </div>
          <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-5 py-4 flex items-start gap-3">
            <AlertCircle className="shrink-0 mt-1" size={22} />
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-amber-200 mb-1">Indicacion</p>
              <p className="text-xl md:text-2xl font-black">{legacyState.indicaciones || 'Sin indicacion'}</p>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default PreacherDisplay;
