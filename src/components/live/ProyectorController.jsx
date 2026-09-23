import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { doc, getDoc, getDocs, setDoc, onSnapshot, query, collection, where, orderBy, limit, updateDoc, deleteDoc, deleteField, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { getSectionKey, parsearCancion } from '../../utils/songParser';
import { Monitor, Play, Pause, PowerOff, X, ArrowLeft, Layers, Type, Eye, Image as ImageIcon, Upload, Loader2, Eraser, AlertCircle, Send, Tv, Star, Megaphone, ChevronRight, Zap, Film, RotateCcw, Rewind, FastForward, Volume2, Folder, FolderPlus, ChevronLeft, Trash2, Edit2, Plus, Fingerprint, Send as SendIcon, Search, SearchCode, Settings2, Clock, ShieldCheck, MessageSquare, Music, BookOpen } from 'lucide-react';
import { calcularOffsetSemitonos, traducirAcorde } from '../../utils/musicCore';
import { getEventSingerForSong, getSingerTone, getSongBaseKey } from '../../utils/songAssignments';
import { formatEventDate, parseAppDate } from '../../utils/dateUtils';
import { getSongSearchMatch } from '../../utils/songSearch';
import { getEventSetlistItems, getEventSongIds } from '../../utils/setlistUtils';
import { uploadToCloudinary } from '../../utils/cloudinaryUpload';
import { isVideoMediaUrl } from '../../utils/mediaUtils';
import AutoFitText from './AutoFitText';
import useMediaLibrary from '../../hooks/useMediaLibrary';
import { canAccessMediaLibrary } from '../../utils/mediaLibraryPermissions';
import { resolveSectionMediaForKey, resolveSongBackground } from '../../utils/mediaResolver';
import { createInactiveSongLiveState } from '../../utils/liveState';
import { buildPanicProjectorPayload, buildProjectorMediaPayload, buildStoppedProjectorMediaPayload, createProjectionWriteQueue, resolveProjectorBackground, selectSongProjectionBackground } from '../../utils/projectorMediaState';
import { agregarCancionEnVivo, quitarCancionEnVivo } from '../../utils/liveSetlistFunctions';
import { updateSongMetadata } from '../../utils/songFunctions';
import { buildInactiveAnnouncementState } from '../../utils/announcementState';
import { useFeedback } from '../ui/FeedbackProvider';
import { PREACHER_REQUEST_STATUS, PREACHER_REQUEST_TYPES, MULTIMEDIA_TO_PASTOR_PRESETS, buildPreachingProjectorState } from '../../utils/preachingLive';
import { isAdmin, isMultimedia, isOwner } from '../../utils/rolePermissions';
import BiblePicker from '../bible/BiblePicker';
import { assertBibleOutlineSize, buildBibleOutlineUpdate, createBibleOutlineItem, getBibleOutlinePreview, normalizeBibleOutlineItems } from '../../utils/bibleOutline';
import { buildCanonicalBibleProjectorState, buildStoppedBibleProjectionPayload, capturePreviousProjectionFields, isMatchingBibleProjection } from '../../utils/bibleProjectionState';
import { getPreachingBiblePreview, normalizePreachingBiblePreviewIndex } from '../../utils/preachingProjectionState';
import { hasPermission } from '../../utils/permissions';
import { createQuickMessage, isMatchingQuickMessageProjection } from '../../utils/quickMessageProjectionState';
import { clearQuickMessageProjection as requestQuickMessageClear, projectQuickMessage as requestQuickMessageProjection, updateQuickMessageHistory as requestQuickMessageHistoryUpdate } from '../../utils/quickMessageFunctions';
import QuickMessagePanel from './QuickMessagePanel';


const ProyectorController = ({ user }) => {
  const { notify } = useFeedback();
  const { eventoId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = location.state?.returnTo || (eventoId === 'global' ? '/multimedia-hub' : `/setlist/${eventoId}`);
  const formatoAcordes = user?.preferencias?.formatoAcordes || 'american';
  const notacion = user?.preferencias?.notacion || 'sharps';
  
  const handleOpenScreen = (path) => {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (isMobile) navigate(path);
    else window.open(path, '_blank');
  };
  
  const [evento, setEvento] = useState(null);
  const [canciones, setCanciones] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [activeSongId, setActiveSongId] = useState(null);
  const [previewSlide, setPreviewSlide] = useState(null); // { texto, titulo }
  const [previewMedia, setPreviewMedia] = useState(null); // { url, type, mode }
  const [liveSlide, setLiveSlide] = useState(null);
  const [isBlackout, setIsBlackout] = useState(false);
  const [modoTransmision, setModoTransmision] = useState(false);
  const [isLogoActive, setIsLogoActive] = useState(false);
  
  const [showFondosModal, setShowFondosModal] = useState(false);
  const [isUploadingFondo, setIsUploadingFondo] = useState(false);
  const [fondoActivo, setFondoActivo] = useState(null);
  const [transicionActiva, setTransicionActiva] = useState('fade');
  const [guardarEnCancion, setGuardarEnCancion] = useState(true);
  const [mediaActive, setMediaActive] = useState(null); // { url, type, playing, volume }
  const [multimediaLib, setMultimediaLib] = useState([]);
  const [largePreview, setLargePreview] = useState(null); // Para el visualizador grande
  const [searchTerm, setSearchTerm] = useState('');
  const [songSearchTerm, setSongSearchTerm] = useState(''); // Búsqueda de canciones
  const [globalSearchResults, setGlobalSearchResults] = useState([]); // Resultados de la DB global
  const [isSearchingGlobal, setIsSearchingGlobal] = useState(false);
  const [showEventList, setShowEventList] = useState(false); // Modal rápido de eventos
  const [showMobileControlsModal, setShowMobileControlsModal] = useState(false); // NEW STATE for mobile controls
  const [mobileActiveTab, setMobileActiveTab] = useState('media'); // 'media' | 'liveControls'
  const [uploadingFiles, setUploadingFiles] = useState([]); // [{id, name, type}]
  const [multimediaFolders, setMultimediaFolders] = useState([]); // ['Carpeta 1', 'Carpeta 2']
  const [currentFolder, setCurrentFolder] = useState(null); // null = root
  const [availableScreens, setAvailableScreens] = useState([]);
  const [upcomingEvents, setUpcomingEvents] = useState([]);
  const [outputs, setOutputs] = useState({}); // { id: { label, type } }
  const [showOutputsModal, setShowOutputsModal] = useState(false);
  const canReadMediaLibrary = canAccessMediaLibrary(user);
  const { items: mediaLibraryItems } = useMediaLibrary({ enabled: canReadMediaLibrary });

  const [confirmModal, setConfirmModal] = useState({ show: false, title: '', message: '', onConfirm: null });
  const [inputModal, setInputModal] = useState({ show: false, title: '', value: '', onConfirm: null, error: '' });

  const [displayLiveSlide, setDisplayLiveSlide] = useState(null);
  const [fadeState, setFadeState] = useState('in');
  const [alertaTarima, setAlertaTarima] = useState('');
  const [alertaTarget, setAlertaTarget] = useState('all');
  const [alertaPriority, setAlertaPriority] = useState('normal');
  const [isSendingAlert, setIsSendingAlert] = useState(false);
  const [tickerMsg, setTickerMsg] = useState('');
  const [isSendingTicker, setIsSendingTicker] = useState(false);
  const liveVideoRef = useRef(null); // Ref para el video en la vista "En Vivo"
  const livePreviewMediaRef = useRef(null); // Ref para el video en la vista "Pre-proyección"
  const undoSnapshotRef = useRef(null);
  const preBibleVisualStateRef = useRef(null);
  const bibleProjectionActiveRef = useRef(false);
  const [enqueueProjectionWrite] = useState(() => createProjectionWriteQueue());
  const [canUndoLastSend, setCanUndoLastSend] = useState(false);
  const [isUndoingLastSend, setIsUndoingLastSend] = useState(false);
  const [countdownMinutes, setCountdownMinutes] = useState(5);
  const [countdownTimeLeft, setCountdownTimeLeft] = useState('');
  const [preacherDraft, setPreacherDraft] = useState({
    tema: '',
    puntoActual: '',
    siguientePunto: '',
    notasPrivadas: '',
    versiculoActual: '',
    tiempoRestante: '',
    mensajesInternos: '',
    indicaciones: ''
  });
  const [preacherLastUpdated, setPreacherLastUpdated] = useState(null);
  const [preacherSendStatus, setPreacherSendStatus] = useState('');
  const [preacherRequests, setPreacherRequests] = useState([]);
  const [preachingStatus, setPreachingStatus] = useState(null);
  const [activePreaching, setActivePreaching] = useState(null);
  const [selectedPreachingBlockId, setSelectedPreachingBlockId] = useState('');
  const [preachingBiblePreviewIndex, setPreachingBiblePreviewIndex] = useState(0);
  const [handlingPreacherRequestId, setHandlingPreacherRequestId] = useState('');
  const [projectionSourceMode, setProjectionSourceMode] = useState('songs');
  const [showScreensMenu, setShowScreensMenu] = useState(false);
  const [screensMenuPosition, setScreensMenuPosition] = useState(null);
  const screensMenuButtonRef = useRef(null);
  const screensMenuRef = useRef(null);
  const [lastBiblePassage, setLastBiblePassage] = useState(null);
  const [biblePreview, setBiblePreview] = useState(null);
  const [biblePreviewOutlineItemId, setBiblePreviewOutlineItemId] = useState(null);
  const [isBibleOutlinePickerOpen, setIsBibleOutlinePickerOpen] = useState(false);
  const [editingBibleOutlineItem, setEditingBibleOutlineItem] = useState(null);
  const [outlinePickerPreview, setOutlinePickerPreview] = useState(null);
  const [isSavingBibleOutline, setIsSavingBibleOutline] = useState(false);
  const [showMobilePreacherSheet, setShowMobilePreacherSheet] = useState(false);
  const [isPreacherPanelOpen, setIsPreacherPanelOpen] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem('controller.preacherPanelOpen') === 'true';
  });

  const canHandlePastorRequests = isOwner(user) || isMultimedia(user);
  const canReadPastorRequests = canHandlePastorRequests || isAdmin(user);
  const canManageBibleOutline = isOwner(user) || isAdmin(user) || isMultimedia(user);
  const canQuickProject = hasPermission(user, 'bible.quickProjection');
  const controllerScreens = [
    { id: 'projector', label: 'Proyector General', detail: 'Pantalla de congregacion', Icon: Monitor, path: `/proyector/${eventoId}` },
    { id: 'singers', label: 'Retorno Cantantes', detail: 'Letras e indicaciones', Icon: Type, path: `/retorno/${eventoId}` },
    { id: 'musicians', label: 'Retorno Musicos', detail: 'Acordes y preparacion', Icon: Music, path: `/retorno-musicos/${eventoId}` },
    { id: 'preacher', label: 'Canal Predicador', detail: 'Pantalla privada', Icon: ShieldCheck, path: `/predicador/${eventoId}` }
  ];

  const openControllerScreen = (path) => {
    setShowScreensMenu(false);
    window.open(path, '_blank', 'noopener,noreferrer');
  };

  const updateScreensMenuPosition = () => {
    const button = screensMenuButtonRef.current;
    if (!button) return;

    const rect = button.getBoundingClientRect();
    const menuWidth = 320;
    const viewportPadding = 8;
    setScreensMenuPosition({
      top: rect.bottom + 8,
      left: Math.max(viewportPadding, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - viewportPadding))
    });
  };

  useEffect(() => {
    if (!showScreensMenu) return undefined;

    const closeOnOutsidePointer = (event) => {
      if (screensMenuButtonRef.current?.contains(event.target) || screensMenuRef.current?.contains(event.target)) return;
      setShowScreensMenu(false);
    };

    updateScreensMenuPosition();
    document.addEventListener('pointerdown', closeOnOutsidePointer, true);
    window.addEventListener('resize', updateScreensMenuPosition);
    window.addEventListener('scroll', updateScreensMenuPosition, true);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer, true);
      window.removeEventListener('resize', updateScreensMenuPosition);
      window.removeEventListener('scroll', updateScreensMenuPosition, true);
    };
  }, [showScreensMenu]);

  useEffect(() => {
    setShowScreensMenu(false);
  }, [eventoId, projectionSourceMode]);

  const publicPreachingBlocks = useMemo(() => {
    const blocks = Array.isArray(activePreaching?.blocks) ? activePreaching.blocks : [];
    return blocks
      .filter(block => block?.type !== 'note' || block.visibility !== 'preacher_only')
      .map((block, index) => ({
        ...block,
        order: Number.isFinite(Number(block.order)) ? Number(block.order) : index
      }))
      .sort((a, b) => a.order - b.order);
  }, [activePreaching?.blocks]);

  const currentPublicPoint = useMemo(() => {
    if (!publicPreachingBlocks.length) return null;
    const statusIndex = Number(preachingStatus?.currentStepIndex);
    const points = publicPreachingBlocks.filter(block => block.type === 'point');
    if (Number.isFinite(statusIndex) && points[statusIndex]) return points[statusIndex];
    return points[0] || null;
  }, [preachingStatus?.currentStepIndex, publicPreachingBlocks]);

  const publicVerses = useMemo(() => publicPreachingBlocks.filter(block => block.type === 'verse'), [publicPreachingBlocks]);
  const publicMediaInstructions = useMemo(() => publicPreachingBlocks.filter(block => block.type === 'mediaInstruction'), [publicPreachingBlocks]);
  const publicProjectableBlocks = useMemo(() => publicPreachingBlocks.filter(block => ['point', 'subpoint', 'verse'].includes(block.type)), [publicPreachingBlocks]);
  const selectedPreachingBlockIndex = Math.max(0, publicProjectableBlocks.findIndex(block => block.id === selectedPreachingBlockId));
  const selectedPreachingBlock = publicProjectableBlocks[selectedPreachingBlockIndex] || null;
  const selectedPreachingBiblePreview = useMemo(
    () => getPreachingBiblePreview(selectedPreachingBlock),
    [selectedPreachingBlock]
  );
  const selectedPreachingBibleSlides = selectedPreachingBiblePreview?.slides || [];
  const safePreachingBiblePreviewIndex = normalizePreachingBiblePreviewIndex(
    selectedPreachingBibleSlides,
    preachingBiblePreviewIndex
  );
  const selectedPreachingBibleSlide = selectedPreachingBibleSlides[safePreachingBiblePreviewIndex] || null;

  const selectPreachingBlock = (blockId) => {
    setSelectedPreachingBlockId(blockId || '');
    setPreachingBiblePreviewIndex(0);
  };

  useEffect(() => {
    if (!publicProjectableBlocks.length) {
      setSelectedPreachingBlockId('');
      return;
    }
    if (!publicProjectableBlocks.some(block => block.id === selectedPreachingBlockId)) {
      setSelectedPreachingBlockId(currentPublicPoint?.id || publicProjectableBlocks[0].id);
      setPreachingBiblePreviewIndex(0);
    }
  }, [currentPublicPoint?.id, publicProjectableBlocks, selectedPreachingBlockId]);
  const bibleOutlineItems = useMemo(
    () => normalizeBibleOutlineItems(evento?.bibleOutline?.items),
    [evento?.bibleOutline?.items]
  );

  useEffect(() => {
    if (!biblePreviewOutlineItemId) return;
    if (bibleOutlineItems.some((item) => item.id === biblePreviewOutlineItemId)) return;
    setBiblePreview(null);
    setBiblePreviewOutlineItemId(null);
    setPreachingBiblePreviewIndex(0);
  }, [bibleOutlineItems, biblePreviewOutlineItemId]);

  const screenNow = useMemo(() => {
    const state = evento?.projectorState;
    if (state?.type === 'preaching') {
      return {
        label: state.contentType === 'verse' || state.preachingType === 'verse'
          ? `${state.reference || state.title || 'Versiculo'}${state.translation ? ` · ${state.translation}` : ''}`
          : state.preachingType === 'point'
          ? `Punto · ${state.content || state.title || 'Predica'}`
          : `${state.reference || state.title || 'Predica'}`,
        actor: state.actorName || state.updatedBy || ''
      };
    }
    if (state?.type === 'lyrics' || liveSlide) {
      return {
        label: `Cancion · ${liveSlide?.titulo || state?.title || 'Seccion'}`,
        actor: state?.actorName || state?.updatedBy || 'Multimedia'
      };
    }
    if (state?.type === 'media' || mediaActive?.url) {
      return {
        label: `Multimedia · ${state?.title || mediaActive?.name || 'Recurso'}`,
        actor: state?.actorName || state?.updatedBy || 'Multimedia'
      };
    }
    if (state?.type === 'blackout' || isBlackout) return { label: 'Blackout', actor: state?.actorName || state?.updatedBy || 'Multimedia' };
    if (state?.type === 'logo' || isLogoActive) return { label: 'Logo', actor: state?.actorName || state?.updatedBy || 'Multimedia' };
    return { label: 'Sin contenido activo', actor: '' };
  }, [evento?.projectorState, isBlackout, isLogoActive, liveSlide, mediaActive]);

  // 🔄 LIMPIADOR DE MEMORIA: Reiniciar estados cuando cambia el evento
  useEffect(() => {
    setActiveSongId(null);
    setPreviewSlide(null);
    setPreviewMedia(null);
    setBiblePreview(null);
    setBiblePreviewOutlineItemId(null);
    setIsBibleOutlinePickerOpen(false);
    setEditingBibleOutlineItem(null);
    setOutlinePickerPreview(null);
    setLiveSlide(null);
    setMediaActive(null);
    setFondoActivo(null);
    setDisplayLiveSlide(null);
    setCurrentFolder(null); // 📂 Resetear carpeta al cambiar de evento
    setSearchTerm(''); // 🔍 Limpiar búsqueda
    setIsLogoActive(false);
    setIsBlackout(false);
    preBibleVisualStateRef.current = null;
    bibleProjectionActiveRef.current = false;
  }, [eventoId]);

  useEffect(() => {
    if (!eventoId) return undefined;
    const unsub = onSnapshot(doc(db, 'eventos', eventoId, 'private', 'preacher'), (snap) => {
      if (!snap.exists()) {
        setPreacherLastUpdated(null);
        return;
      }
      const data = snap.data();
      setPreacherLastUpdated(data.updatedAt || null);
      setPreacherDraft(prev => ({
        ...prev,
        tema: data.tema || '',
        puntoActual: data.puntoActual || '',
        siguientePunto: data.siguientePunto || '',
        notasPrivadas: data.notasPrivadas || '',
        versiculoActual: data.versiculoActual || '',
        tiempoRestante: data.tiempoRestante || '',
        mensajesInternos: data.mensajesInternos || '',
        indicaciones: data.indicaciones || ''
      }));
    });
    return () => unsub();
  }, [eventoId]);

  useEffect(() => {
    setPreacherRequests([]);
    setPreachingStatus(null);
    if (!canReadPastorRequests || !eventoId || eventoId === 'global') return undefined;

    const requestsQuery = query(
      collection(db, 'eventos', eventoId, 'preacherRequests'),
      where('status', 'in', [PREACHER_REQUEST_STATUS.PENDING, PREACHER_REQUEST_STATUS.PROJECTED, PREACHER_REQUEST_STATUS.IGNORED]),
      orderBy('createdAt', 'asc'),
      limit(10)
    );
    const unsubRequests = onSnapshot(requestsQuery, (snap) => {
      setPreacherRequests(snap.docs.map(item => ({ id: item.id, eventId: eventoId, ...item.data() })));
    }, (error) => {
      console.warn('No se pudieron cargar solicitudes del Pastor:', error);
    });

    const unsubStatus = onSnapshot(collection(db, 'eventos', eventoId, 'preachingStatus'), (snap) => {
      const latest = snap.docs
        .map(item => ({ id: item.id, ...item.data() }))
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0] || null;
      setPreachingStatus(latest);
    }, (error) => {
      console.warn('No se pudo cargar progreso del Pastor:', error);
    });

    return () => {
      unsubRequests();
      unsubStatus();
    };
  }, [canReadPastorRequests, eventoId]);

  useEffect(() => {
    setActivePreaching(null);
    const predicaId = evento?.predicaId || preachingStatus?.predicaId;
    if (!canReadPastorRequests || !predicaId) return undefined;
    const unsub = onSnapshot(doc(db, 'predicas', predicaId), (snap) => {
      setActivePreaching(snap.exists() ? { id: snap.id, ...snap.data() } : null);
    }, (error) => {
      console.warn('No se pudo cargar predica activa en controlador:', error);
    });
    return () => unsub();
  }, [canReadPastorRequests, evento?.predicaId, preachingStatus?.predicaId]);

  // Detectar monitores físicos (Para lanzar a pantalla específica)
  useEffect(() => {
    const detectarPantallas = async () => {
      try {
        if (!window.getScreenDetails) return;
        const screenDetails = await window.getScreenDetails();
        setAvailableScreens(screenDetails.screens);
        screenDetails.onscreenschange = () => setAvailableScreens(screenDetails.screens);
      } catch (e) {
        console.error("Error detectando pantallas:", e);
      }
    };
    detectarPantallas();
  }, []);

  useEffect(() => {
    let unsubEvento;

    const fetchUpcoming = async () => {
      const hoy = new Date().toISOString().slice(0, 10);
      const q = query(collection(db, 'eventos'), where('fecha', '>=', hoy), orderBy('fecha', 'asc'), limit(5));
      const snap = await getDocs(q);
      setUpcomingEvents(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(ev => parseAppDate(ev.fecha)));
    };
    fetchUpcoming();

    const fetchEvent = async () => {
      try {
        const eventoSnap = await getDoc(doc(db, 'eventos', eventoId));
        if (eventoSnap.exists()) {
          const evData = eventoSnap.data();
          
          // Cargar canciones (solo si no es modo global)
          if (eventoId !== 'global') {
            const songIds = getEventSongIds(evData);
            const uniqueIds = [...new Set(songIds)];
            if (uniqueIds.length > 0) {
              const snaps = await Promise.all(uniqueIds.map(id => getDoc(doc(db, 'canciones', id))));
              setCanciones(snaps.map(s => ({ id: s.id, ...s.data() })));
            }
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchEvent();

    // 1. Escuchar la Bóveda Multimedia Global
    const unsubLib = onSnapshot(doc(db, 'sistema', 'multimedia'), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setMultimediaLib(data.multimediaLib || []);
        setMultimediaFolders(data.multimediaFolders || []);
        
        // MIGRACION REFORZADA: Si el doc existe pero las carpetas no, intentamos traerlas de 'global'
        if (!data.multimediaFolders || data.multimediaFolders.length === 0) {
          getDoc(doc(db, 'eventos', 'global')).then(oldSnap => {
            if (oldSnap.exists() && oldSnap.data().multimediaFolders) {
              setDoc(doc(db, 'sistema', 'multimedia'), {
                multimediaFolders: oldSnap.data().multimediaFolders || []
              }, { merge: true });
            }
          });
        }
      } 
      else {
        // MIGRACION: Si el nuevo documento no existe, intentamos recuperar del antiguo 'global'
        getDoc(doc(db, 'eventos', 'global')).then(oldSnap => {
          if (oldSnap.exists() && oldSnap.data().multimediaLib) {
            setDoc(doc(db, 'sistema', 'multimedia'), {
              multimediaLib: oldSnap.data().multimediaLib || [],
              multimediaFolders: oldSnap.data().multimediaFolders || []
            }, { merge: true });
          }
        });
      }
    });

    // 2. Escuchar la Matriz de Salidas siempre desde 'global'
    const unsubOutputs = onSnapshot(doc(db, 'eventos', 'global'), (snap) => {
      if (snap.exists()) {
        setOutputs(snap.data().outputs || {});
      }
    });

    unsubEvento = onSnapshot(doc(db, 'eventos', eventoId), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setEvento(data);
        bibleProjectionActiveRef.current = data.projectorState?.contentType === 'bible';
        setLiveSlide(data.proyectorSlide || null);
        setIsBlackout(data.proyectorApagado ?? false);
        setFondoActivo(data.proyectorFondo || null);
        setTransicionActiva(data.proyectorTransicion || 'fade');
        setModoTransmision(data.proyectorModoTransmision ?? false);
        setIsLogoActive(data.proyectorLogo ?? false);
        setMediaActive(data.proyectorMedia || null);
      }
    });

     return () => { 
      if(unsubEvento) unsubEvento(); 
      unsubLib();
      unsubOutputs();
    }
  }, [eventoId]);

  // Sincronizar la animación del proyector en la vista del controlador
  useEffect(() => {
    if (!liveSlide) {
      setDisplayLiveSlide(null);
      return;
    }
    if (!displayLiveSlide || transicionActiva === 'none') {
      setDisplayLiveSlide(liveSlide);
      setFadeState('in');
      return;
    }
    if (liveSlide.texto !== displayLiveSlide.texto) {
      setFadeState('out');
      const timeout = setTimeout(() => {
        setDisplayLiveSlide(liveSlide);
        setFadeState('in');
      }, transicionActiva === 'fade' ? 250 : 150);

      return () => clearTimeout(timeout);
    }
  }, [liveSlide, transicionActiva, displayLiveSlide]);

  useEffect(() => {
    const countdown = evento?.proyectorCountdown;
    if (!countdown?.active || !countdown?.endTimestamp) {
      setCountdownTimeLeft('');
      return;
    }

    const updateTimeLeft = () => {
      const diff = countdown.endTimestamp - Date.now();
      if (diff <= 0) {
        setCountdownTimeLeft('00:00');
        return;
      }
      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      setCountdownTimeLeft(`${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
    };

    updateTimeLeft();
    const interval = setInterval(updateTimeLeft, 1000);
    return () => clearInterval(interval);
  }, [evento?.proyectorCountdown]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('controller.preacherPanelOpen', String(isPreacherPanelOpen));
  }, [isPreacherPanelOpen]);

  // Sincronización del video en la vista "En Vivo" del controlador
  useEffect(() => {
    if (liveVideoRef.current && mediaActive && mediaActive.type === 'video') {
      if (mediaActive.playing) {
        liveVideoRef.current.play().catch(e => console.warn("Autoplay blocked in live preview:", e));
      } else {
        liveVideoRef.current.pause();
      }
      liveVideoRef.current.volume = mediaActive.volume ?? 1;

      if (mediaActive.seekRequest) {
        const { type, time } = mediaActive.seekRequest;
        if (liveVideoRef.current._lastSeekTime !== time) { // Evitar re-seek en el mismo comando
          liveVideoRef.current._lastSeekTime = time;
          if (type === 'start') liveVideoRef.current.currentTime = 0;
          if (type === 'back10') liveVideoRef.current.currentTime = Math.max(0, liveVideoRef.current.currentTime - 10);
          if (type === 'fwd10') liveVideoRef.current.currentTime = Math.min(liveVideoRef.current.duration, liveVideoRef.current.currentTime + 10);
        }
      }
    }
  }, [mediaActive]);

  // Sincronización del video en la vista "Pre-proyección" del controlador
  useEffect(() => {
    if (livePreviewMediaRef.current && previewMedia && previewMedia.type === 'video') {
      livePreviewMediaRef.current.volume = previewMedia.volume ?? 1;
    }
  }, [previewMedia]);

  // 🔍 Lógica de búsqueda global de canciones (Debounce)
  useEffect(() => {
    if (!songSearchTerm.trim()) {
      setGlobalSearchResults([]);
      setIsSearchingGlobal(false);
      return;
    }

    const delayDebounceFn = setTimeout(async () => {
      setIsSearchingGlobal(true);
      try {
        // En un entorno real, filtrarías en Firestore. Aquí buscamos una muestra rápida
        // o puedes usar un índice de búsqueda. Por ahora, traeremos las más recientes
        // y filtraremos localmente para mayor compatibilidad.
        const qAll = query(collection(db, 'canciones'));
        const snap = await getDocs(qAll);
        const results = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(c => getSongSearchMatch(c, songSearchTerm).matches)
          .slice(0, 50);
        setGlobalSearchResults(results);
      } catch (e) {
        console.error("Error buscando canciones:", e);
      } finally {
        setIsSearchingGlobal(false);
      }
    }, 400);

    return () => clearTimeout(delayDebounceFn);
  }, [songSearchTerm]);

  const activeSong = canciones.find(c => c.id === activeSongId);
  const secciones = activeSong ? parsearCancion(activeSong.letraRaw) : [];

  const getSetlistSongItems = () => {
    const setlistItems = getEventSetlistItems(evento);
    return setlistItems.filter(item => item.type === 'song');
  };

  const buildLiveState = (songId, sectionIndex = -1, sectionTitle = '', fallbackSong = null) => {
    const songItems = getSetlistSongItems();
    const song = canciones.find(c => c.id === songId) || fallbackSong;
    return {
      activeSongId: songId || null,
      activeSongTitle: song?.titulo || '',
      activeSongIndex: songItems.findIndex(item => item.value === songId),
      activeSectionIndex: sectionIndex,
      activeSectionTitle: sectionTitle || '',
      updatedAt: Date.now(),
      updatedBy: user?.nombre || user?.email || 'Multimedia'
    };
  };

  const buildInactiveSongLiveState = (contentType = 'none', contentTitle = '') => (
    createInactiveSongLiveState({
      contentType,
      contentTitle,
      updatedBy: user?.nombre || user?.email || 'Multimedia'
    })
  );

  const cloneLiveValue = (value) => {
    if (value === undefined) return undefined;
    if (value === null) return null;
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return value;
    }
  };

  const visualStateFields = [
    'proyectorSlide',
    'projectorState',
    'proyectorFondo',
    'proyectorFondoMedia',
    'proyectorSongId',
    'proyectorSlideIndex',
    'proyectorNextSlide',
    'proyectorNextSong',
    'proyectorOffset',
    'liveState',
    'currentSongId',
    'proyectorLogo',
    'proyectorApagado',
    'proyectorMedia',
    'proyectorModoTransmision',
    'proyectorAlerta',
    'proyectorTicker'
  ];

  const captureVisualStateSnapshot = () => {
    if (!evento) return null;
    return visualStateFields.reduce((snapshot, field) => {
      if (Object.prototype.hasOwnProperty.call(evento, field)) {
        snapshot[field] = cloneLiveValue(evento[field]);
      } else {
        snapshot[field] = undefined;
      }
      return snapshot;
    }, {});
  };

  const rememberUndoSnapshot = () => {
    const snapshot = captureVisualStateSnapshot();
    if (!snapshot) return false;
    undoSnapshotRef.current = snapshot;
    setCanUndoLastSend(true);
    return true;
  };

  const buildRestorePayload = (snapshot) => {
    const payload = {};
    visualStateFields.forEach(field => {
      const value = snapshot?.[field];
      payload[field] = value === undefined ? deleteField() : cloneLiveValue(value);
    });

    return payload;
  };

  const undoLastSend = async () => {
    const snapshot = undoSnapshotRef.current;
    if (!snapshot || isUndoingLastSend) return;

    setIsUndoingLastSend(true);
    try {
      await enqueueProjectionWrite(() => updateDoc(doc(db, 'eventos', eventoId), buildRestorePayload(snapshot)));
      undoSnapshotRef.current = null;
      setCanUndoLastSend(false);
      setPreviewMedia(null);
      notify('Ultimo envío deshecho.', { type: 'success' });
    } catch (e) {
      console.error('Error restaurando el estado anterior:', e);
      notify('No se pudo restaurar el estado anterior.', { type: 'error' });
    } finally {
      setIsUndoingLastSend(false);
    }
  };

  const handleSelectSong = (song) => {
    if (!song) return;
    setActiveSongId(song.id);
    setPreviewSlide(null);
  };

  // Convertir las secciones en Diapositivas (Slides)
  const slides = [];
  secciones.forEach((sec, index) => {
    let texto = sec.lineas.map(linea => 
      linea.map(palabra => palabra.map(silaba => silaba.texto === '\u00A0' ? '' : silaba.texto).join('')).join(' ')
    ).join('\n');
    const sectionKey = getSectionKey(sec, index);
    slides.push({
      titulo: sec.titulo,
      texto: texto.trim() || ' ',
      lineas: sec.lineas,
      cues: (sec.items || []).filter(item => item.type === 'cue').map(item => item.text),
      sectionKey,
      media: resolveSectionMediaForKey(activeSong?.sectionMedia, sectionKey, mediaLibraryItems),
      originalIndex: slides.length
    });
  });

  const formatFriendlyDate = (dateValue) => {
    return formatEventDate(dateValue, { weekday: 'long', day: 'numeric', month: 'long' });
  };

  const lanzarSalidaGlobal = (id) => {
    const out = outputs[id];
    if (!out) return;
    
    const path = `/output/${eventoId}/${id}`;
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

  // Funciones para gestionar la Matriz de Salidas
  const handleUpdateOutput = async (id, data) => {
    const newOutputs = { ...outputs, [id]: { ...outputs[id], ...data } };
    await setDoc(doc(db, 'eventos', 'global'), { outputs: newOutputs }, { merge: true });
  };

  const crearOutput = async () => {
    const id = `out_${Date.now()}`;
    const newOutputs = { ...outputs, [id]: { label: `Nueva Salida`, type: 'proyector' } };
    await setDoc(doc(db, 'eventos', 'global'), { outputs: newOutputs }, { merge: true });
  };

  const eliminarOutput = async (id) => {
    const newOutputs = { ...outputs }; delete newOutputs[id];
    await setDoc(doc(db, 'eventos', 'global'), { outputs: newOutputs }, { merge: true });
  };

  const handleIdentifyOutput = async (id) => {
    const newOutputs = { ...outputs, [id]: { ...outputs[id], identifyAt: Date.now() } };
    await setDoc(doc(db, 'eventos', 'global'), { outputs: newOutputs }, { merge: true });
  };

  const updatePreacherDraft = (field, value) => {
    setPreacherDraft(prev => ({ ...prev, [field]: value }));
  };

  const sendToPreacher = async () => {
    const now = Date.now();
    const payload = {
      ...preacherDraft,
      updatedAt: now,
      startedAt: preacherLastUpdated || now,
      sentBy: user?.nombre || user?.email || 'Multimedia'
    };
    try {
      await setDoc(doc(db, 'eventos', eventoId, 'private', 'preacher'), payload, { merge: true });
      await updateDoc(doc(db, 'eventos', eventoId), { preacherState: deleteField() }).catch(() => {});
      setPreacherLastUpdated(now);
      setPreacherSendStatus('Enviado al Predicador');
      setTimeout(() => setPreacherSendStatus(''), 3500);
    } catch (e) {
      console.error('Error enviando contenido privado al predicador:', e);
      setPreacherSendStatus('No se pudo enviar');
    }
  };

  const clearPreacherDisplay = async () => {
    try {
      await deleteDoc(doc(db, 'eventos', eventoId, 'private', 'preacher'));
      await updateDoc(doc(db, 'eventos', eventoId), { preacherState: deleteField() }).catch(() => {});
      setPreacherLastUpdated(null);
      setPreacherSendStatus('Pantalla del Predicador limpia');
      setTimeout(() => setPreacherSendStatus(''), 3500);
    } catch (e) {
      console.error('Error limpiando pantalla del predicador:', e);
      setPreacherSendStatus('No se pudo limpiar');
    }
  };

  const projectPreacherRequest = async (request) => {
    if (!canHandlePastorRequests || !request?.id || handlingPreacherRequestId) return;
    setHandlingPreacherRequestId(request.id);
    try {
      rememberUndoSnapshot();
      const projectorState = buildPreachingProjectorState(request, user, {
        sourceActor: 'multimedia',
        previousProjectorState: evento?.projectorState || null
      });
      await enqueueProjectionWrite(() => updateDoc(doc(db, 'eventos', eventoId), {
        announcementState: buildInactiveAnnouncementState(),
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
        liveState: buildInactiveSongLiveState('preaching', request.title || request.reference || 'Predica'),
        currentSongId: null
      }));
      await updateDoc(doc(db, 'eventos', eventoId, 'preacherRequests', request.id), {
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
      setHandlingPreacherRequestId('');
    }
  };

  const projectPreachingBlockFromController = async (block, selectedVerseIndex = 0) => {
    if (!canHandlePastorRequests || !block || !activePreaching?.id) return;
    const biblePreview = getPreachingBiblePreview(block);
    if (biblePreview) {
      await projectBiblePassage({
        passage: biblePreview.passage,
        slides: biblePreview.slides,
        selectedIndex: selectedVerseIndex
      });
      return;
    }
    try {
      rememberUndoSnapshot();
      const requestLike = block.type === PREACHER_REQUEST_TYPES.VERSE || block.type === 'verse'
        ? {
          type: PREACHER_REQUEST_TYPES.VERSE,
          predicaId: activePreaching.id,
          blockId: block.id || '',
          title: block.reference || 'Versiculo',
          reference: block.reference || '',
          translation: block.translation || '',
          text: block.text || ''
        }
        : {
          type: PREACHER_REQUEST_TYPES.POINT,
          predicaId: activePreaching.id,
          blockId: block.id || '',
          title: block.title || block.content || 'Punto de predica',
          pointNumber: block.order != null ? Number(block.order) + 1 : null
        };
      const projectorState = buildPreachingProjectorState(requestLike, user, {
        sourceActor: 'multimedia',
        previousProjectorState: evento?.projectorState || null
      });
      await enqueueProjectionWrite(() => updateDoc(doc(db, 'eventos', eventoId), {
        announcementState: buildInactiveAnnouncementState(),
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
        liveState: buildInactiveSongLiveState('preaching', requestLike.title || requestLike.reference || 'Predica'),
        currentSongId: null
      }));
      notify('Contenido de predica proyectado.', { type: 'success' });
    } catch (error) {
      console.error('Error proyectando bloque de predica:', error);
      notify('No se pudo proyectar la predica.', { type: 'error' });
    }
  };

  const projectBiblePassage = async ({ passage, slides = [], selectedIndex = 0, outlineItemId = null }) => {
    if (!passage) return;
    const safeSlides = slides.length ? slides : [{
      reference: passage.reference,
      translation: passage.abbreviation,
      translationName: passage.translationName,
      text: passage.text
    }];
    const safeIndex = Math.max(0, Math.min(selectedIndex, safeSlides.length - 1));
    const slide = safeSlides[safeIndex];
    try {
      rememberUndoSnapshot();
      const now = Date.now();
      const projectionActionId = `${now}-${globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)}`;
      await enqueueProjectionWrite(() => runTransaction(db, async (transaction) => {
        const eventRef = doc(db, 'eventos', eventoId);
        const eventSnapshot = await transaction.get(eventRef);
        if (!eventSnapshot.exists()) throw new Error('El evento ya no esta disponible.');
        const previousProjectionFields = capturePreviousProjectionFields(eventSnapshot.data());
        transaction.update(eventRef, {
        announcementState: buildInactiveAnnouncementState(),
        projectorState: buildCanonicalBibleProjectorState({
          type: 'preaching',
          preachingType: 'verse',
          contentType: 'bible',
          title: slide.reference,
          reference: slide.reference,
          translation: slide.translation,
          translationName: slide.translationName,
          content: slide.text,
          provider: passage.provider,
          bibleId: passage.bibleId,
          passageId: passage.passageId,
          copyright: passage.copyright || '',
          bibleSlideIndex: slide.slideIndex || 0,
          bibleSlideCount: safeSlides.length,
          bible: {
            passageId: passage.passageId,
            translation: passage.abbreviation,
            translationName: passage.translationName,
            slides: safeSlides,
            slideIndex: safeIndex,
            slideCount: safeSlides.length,
            outlineItemId: outlineItemId || null
          },
          media: null,
          background: null,
          backgroundMedia: null,
          previousProjectorState: null,
          previousProjectionFields,
          sourceActor: 'multimedia',
          actorUid: user?.uid || null,
          actorName: user?.nombre || user?.email || 'Multimedia',
          actorRole: user?.rol || user?.role || '',
          updatedBy: user?.nombre || user?.email || 'Multimedia',
          updatedAt: now,
          projectionVersion: now,
          projectionActionId
        }),
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
        liveState: buildInactiveSongLiveState('bible', slide.reference || 'Biblia'),
        currentSongId: null
        });
      }));
      bibleProjectionActiveRef.current = true;
      setLastBiblePassage(passage);
      notify('Pasaje proyectado.', { type: 'success' });
    } catch (error) {
      console.error('Error proyectando Biblia:', error);
      notify('No se pudo proyectar el pasaje.', { type: 'error' });
    }
  };

  const openBibleOutlinePicker = (item = null) => {
    if (!canManageBibleOutline || eventoId === 'global') return;
    setEditingBibleOutlineItem(item);
    setOutlinePickerPreview(item ? getBibleOutlinePreview(item) : null);
    setIsBibleOutlinePickerOpen(true);
  };

  const closeBibleOutlinePicker = () => {
    if (isSavingBibleOutline) return;
    setIsBibleOutlinePickerOpen(false);
    setEditingBibleOutlineItem(null);
    setOutlinePickerPreview(null);
  };

  const updateBibleOutline = async (mutate, successMessage) => {
    if (!canManageBibleOutline || eventoId === 'global') {
      notify('El bosquejo biblico requiere un evento especifico.', { type: 'error' });
      return false;
    }

    setIsSavingBibleOutline(true);
    try {
      await runTransaction(db, async (transaction) => {
        const eventRef = doc(db, 'eventos', eventoId);
        const snapshot = await transaction.get(eventRef);
        if (!snapshot.exists()) throw new Error('El evento ya no esta disponible.');
        const currentItems = normalizeBibleOutlineItems(snapshot.data()?.bibleOutline?.items);
        const nextItems = assertBibleOutlineSize(mutate(currentItems));
        transaction.update(eventRef, buildBibleOutlineUpdate(nextItems));
      });
      notify(successMessage, { type: 'success' });
      return true;
    } catch (error) {
      console.error('Error guardando bosquejo biblico:', error);
      notify(error.message || 'No se pudo guardar el bosquejo biblico.', { type: 'error' });
      return false;
    } finally {
      setIsSavingBibleOutline(false);
    }
  };

  const saveBibleOutlinePassage = async ({ passage, slides }) => {
    const itemToEdit = editingBibleOutlineItem;
    const saved = await updateBibleOutline((items) => {
      if (itemToEdit) {
        const index = items.findIndex((item) => item.id === itemToEdit.id);
        if (index < 0) throw new Error('El pasaje ya no existe en el bosquejo.');
        const replacement = createBibleOutlineItem({ passage, slides, existingItem: items[index] });
        return items.map((item, itemIndex) => itemIndex === index ? replacement : item);
      }
      return [...items, createBibleOutlineItem({ passage, slides })];
    }, itemToEdit ? 'Pasaje preparado actualizado.' : 'Pasaje agregado al bosquejo.');
    if (saved) closeBibleOutlinePicker();
  };

  const previewBibleOutlineItem = (item) => {
    setBiblePreview(getBibleOutlinePreview(item));
    setBiblePreviewOutlineItemId(item.id);
  };

  const clearLocalBibleControl = () => {
    setBiblePreview(null);
    setBiblePreviewOutlineItemId(null);
    setLastBiblePassage(null);
    preBibleVisualStateRef.current = null;
    bibleProjectionActiveRef.current = false;
  };

  const stopPublicBibleProjection = async () => {
    const projectionActionId = evento?.projectorState?.projectionActionId;
    if (!isMatchingBibleProjection(evento?.projectorState, projectionActionId)) return;
    try {
      const restored = await enqueueProjectionWrite(() => runTransaction(db, async (transaction) => {
        const eventRef = doc(db, 'eventos', eventoId);
        const eventSnapshot = await transaction.get(eventRef);
        if (!eventSnapshot.exists()) return false;
        const currentState = eventSnapshot.data()?.projectorState;
        if (!isMatchingBibleProjection(currentState, projectionActionId)) return false;
        transaction.update(eventRef, buildStoppedBibleProjectionPayload({
          previousProjectionFields: currentState.previousProjectionFields,
          liveState: buildInactiveSongLiveState('none', 'Sin contenido activo')
        }));
        return true;
      }));
      if (!restored) return;
      preBibleVisualStateRef.current = null;
      bibleProjectionActiveRef.current = false;
      notify('Proyeccion biblica detenida.', { type: 'success' });
    } catch (error) {
      console.error('Error deteniendo la proyeccion biblica:', error);
      notify('No se pudo detener la proyeccion biblica.', { type: 'error' });
    }
  };

  const projectQuickMessage = async (draft, { historyEntryId = null } = {}) => {
    if (!canQuickProject) return null;
    const message = createQuickMessage(draft);
    if (!message) {
      notify('El punto debe contener texto valido y no superar el limite permitido.', { type: 'error' });
      return null;
    }
    try {
      rememberUndoSnapshot();
      const result = await enqueueProjectionWrite(() => requestQuickMessageProjection({
        eventoId,
        presentationType: message.presentationType,
        segments: message.segments,
        historyEntryId
      }));
      notify('Punto del mensaje proyectado.', { type: 'success' });
      return result;
    } catch (error) {
      console.error('Error proyectando punto rapido:', error);
      notify('No se pudo proyectar el punto.', { type: 'error' });
      throw error;
    }
  };

  const updateQuickMessageHistory = async ({ operation, entryId = null }) => {
    if (!canQuickProject) return null;
    try {
      return await requestQuickMessageHistoryUpdate({ eventoId, operation, entryId });
    } catch (error) {
      console.error('Error actualizando historial de puntos:', error);
      notify('No se pudo actualizar el historial de puntos.', { type: 'error' });
      throw error;
    }
  };

  const clearQuickMessageProjection = async () => {
    const projectionActionId = evento?.projectorState?.projectionActionId;
    if (!isMatchingQuickMessageProjection(evento?.projectorState, projectionActionId)) return;
    try {
      await enqueueProjectionWrite(() => requestQuickMessageClear({ eventoId, projectionActionId }));
      notify('Punto del mensaje retirado.', { type: 'success' });
    } catch (error) {
      console.error('Error limpiando punto rapido:', error);
      notify('No se pudo limpiar el punto.', { type: 'error' });
      throw error;
    }
  };

  const projectBibleOutlineItem = async (item) => {
    const preview = getBibleOutlinePreview(item);
    if (!preview) return;
    setBiblePreview(preview);
    setBiblePreviewOutlineItemId(item.id);
    await projectBiblePassage({ ...preview, outlineItemId: item.id });
  };

  const moveBiblePreviewSlide = async (delta) => {
    const slides = Array.isArray(biblePreview?.slides) ? biblePreview.slides : [];
    if (slides.length < 2) return;
    const currentIndex = Number(biblePreview?.selectedIndex || 0);
    const nextIndex = Math.max(0, Math.min(currentIndex + delta, slides.length - 1));
    if (nextIndex === currentIndex) return;
    setBiblePreview((current) => current ? { ...current, selectedIndex: nextIndex } : current);
  };

  const selectBiblePreviewSlide = (index) => {
    const slides = Array.isArray(biblePreview?.slides) ? biblePreview.slides : [];
    if (!slides[index]) return;
    setBiblePreview((current) => current ? { ...current, selectedIndex: index } : current);
  };

  const moveBibleOutlineItem = async (itemId, delta) => {
    await updateBibleOutline((items) => {
      const index = items.findIndex((item) => item.id === itemId);
      const targetIndex = index + delta;
      if (index < 0 || targetIndex < 0 || targetIndex >= items.length) return items;
      const next = [...items];
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return next.map((item, nextOrder) => ({ ...item, order: nextOrder }));
    }, 'Orden del bosquejo actualizado.');
  };

  const removeBibleOutlineItem = async (item) => {
    await updateBibleOutline((items) => items.filter((candidate) => candidate.id !== item.id), 'Pasaje eliminado del bosquejo.');
  };

  const requestRemoveBibleOutlineItem = (item) => {
    const isProjected = evento?.projectorState?.contentType === 'bible'
      && evento?.projectorState?.bible?.outlineItemId === item.id;
    if (!isProjected) {
      removeBibleOutlineItem(item);
      return;
    }
    setConfirmModal({
      show: true,
      title: 'Eliminar pasaje proyectado',
      message: 'Se quitara del bosquejo, pero la proyeccion actual continuara hasta que envíes otro contenido.',
      onConfirm: () => {
        setConfirmModal((current) => ({ ...current, show: false }));
        removeBibleOutlineItem(item);
      }
    });
  };

  const ignorePreacherRequest = async (request) => {
    if (!canHandlePastorRequests || !request?.id || handlingPreacherRequestId) return;
    setHandlingPreacherRequestId(request.id);
    try {
      await updateDoc(doc(db, 'eventos', eventoId, 'preacherRequests', request.id), {
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
      setHandlingPreacherRequestId('');
    }
  };

  const sendPastorPreset = async (message) => {
    if (!canHandlePastorRequests) return;
    try {
      await setDoc(doc(db, 'eventos', eventoId, 'private', 'preacher'), {
        mensajesInternos: message,
        updatedAt: Date.now(),
        sentBy: user?.nombre || user?.email || 'Multimedia'
      }, { merge: true });
      setPreacherSendStatus('Aviso enviado al Predicador');
      setTimeout(() => setPreacherSendStatus(''), 3500);
      notify('Aviso enviado al Pastor.', { type: 'success' });
    } catch (error) {
      console.error('Error enviando aviso al Pastor:', error);
      notify('No se pudo enviar el aviso al Pastor.', { type: 'error' });
    }
  };

  // Función para proyectar la siguiente diapositiva automáticamente
  const projectNextSlide = () => {
    if (slides.length === 0) return;
    
    // Sincronizar con el índice real en Firestore para evitar saltos
    const isSongLive = activeSongId === evento?.proyectorSongId;
    const currentIndex = isSongLive ? (evento?.proyectorSlideIndex ?? -1) : -1;

    if (currentIndex < slides.length - 1) {
      projectSlide(slides[currentIndex + 1]);
    } else if (currentIndex === slides.length - 1) {
      projectSlide({ titulo: 'Instrumental', texto: ' ', originalIndex: -1 });
    } else {
      projectSlide(slides[0]); // Por seguridad, si el índice es extraño, ir al inicio
    }
  };

  const projectSlide = async (slide) => {
    if (!slide) { console.warn("No slide provided to projectSlide"); return; }
    rememberUndoSnapshot();
    
    let nextSlide = null;
    if (slide.originalIndex !== undefined && slide.originalIndex < slides.length - 1) {
      nextSlide = slides[slide.originalIndex + 1];
    }
    const sectionPrimaryMedia = Array.isArray(slide.media) ? slide.media.find(resource => resource?.url) : null;
    const songBackground = resolveSongBackground(activeSong, mediaLibraryItems);
    const backgroundSourceMedia = selectSongProjectionBackground(sectionPrimaryMedia, songBackground);
    const slideBackground = backgroundSourceMedia?.url || null;
    const slideBackgroundMedia = backgroundSourceMedia?.url ? {
      mediaId: backgroundSourceMedia.mediaId || null,
      title: backgroundSourceMedia.title || backgroundSourceMedia.name || slide.titulo || 'Multimedia de seccion',
      type: backgroundSourceMedia.type || (isVideoMediaUrl(backgroundSourceMedia.url) ? 'video' : 'image'),
      url: backgroundSourceMedia.url,
      thumbnailUrl: backgroundSourceMedia.thumbnailUrl || '',
      provider: backgroundSourceMedia.provider || '',
      source: backgroundSourceMedia.source || (sectionPrimaryMedia ? 'sectionMedia' : 'songBackground')
    } : null;

    // Encontrar el siguiente elemento del setlist (Cancion o Nota)
    let offset = 0;
    let nextSongInfo = null;
    if (evento && activeSongId) {
      const setlistItems = getEventSetlistItems(evento);
      const activeIdx = setlistItems.findIndex(i => i.type === 'song' && i.value === activeSongId);
      if (activeIdx !== -1 && activeIdx < setlistItems.length - 1) {
        const nextElement = setlistItems[activeIdx + 1];
        if (nextElement.type === 'note') {
          nextSongInfo = `📌 ${nextElement.value}`;
        } else {
          const nextSongObj = canciones.find(c => c.id === nextElement.value);
          if (nextSongObj) {
            const cantante = getEventSingerForSong(evento, nextSongObj.id);
            const tonoFinal = getSingerTone(nextSongObj, cantante) || getSongBaseKey(nextSongObj);
            nextSongInfo = `🎵 ${nextSongObj.titulo} (${traducirAcorde(tonoFinal || 'C', formatoAcordes, notacion)})`;
          }
        }
      }

      // Calcular la transposición actual para la Pantalla de Musicos
      const cancionActiva = canciones.find(c => c.id === activeSongId);
      const cantanteActivo = getEventSingerForSong(evento, activeSongId);
      const tonoDestino = getSingerTone(cancionActiva, cantanteActivo);
      if (cancionActiva && tonoDestino) {
        offset = calcularOffsetSemitonos(getSongBaseKey(cancionActiva), tonoDestino);
      }
    }

    const updates = {
      announcementState: buildInactiveAnnouncementState(),
      proyectorSlide: { titulo: slide.titulo, texto: slide.texto, lineas: slide.lineas ? JSON.stringify(slide.lineas) : null },
      projectorState: {
        type: 'lyrics',
        contentType: 'lyrics',
        preachingType: null,
        title: slide.titulo,
        content: slide.texto,
        media: null,
        bible: null,
        reference: null,
        translation: null,
        translationName: null,
        provider: null,
        bibleId: null,
        passageId: null,
        copyright: '',
        previousProjectorState: null,
        timer: evento?.proyectorCountdown || null,
        background: slideBackground,
        backgroundMedia: slideBackgroundMedia,
        updatedAt: Date.now()
      },
      proyectorFondo: slideBackground,
      proyectorFondoMedia: slideBackgroundMedia,
      proyectorSongId: activeSongId,
      proyectorSlideIndex: slide.originalIndex ?? -1,
      proyectorNextSlide: nextSlide ? { titulo: nextSlide.titulo, texto: nextSlide.texto, lineas: nextSlide.lineas ? JSON.stringify(nextSlide.lineas) : null } : null,
      proyectorNextSong: nextSongInfo,
      proyectorOffset: offset,
      liveState: buildLiveState(activeSongId, slide.originalIndex ?? -1, slide.titulo || ''),
      currentSongId: activeSongId || null,
      proyectorLogo: false,
      proyectorApagado: false,
      proyectorMedia: null, // Limpiar cualquier media activa al proyectar una diapositiva
    };
    try { await enqueueProjectionWrite(() => updateDoc(doc(db, 'eventos', eventoId), updates)); }
    catch (e) { console.error("Error al proyectar diapositiva:", e); }
  };

   // + Agregar cancion externa al evento actual
  const agregarCancionAlSetlist = async (song) => {
    if (!evento) return;

    try {
      const result = await agregarCancionEnVivo({ eventoId, songId: song.id });
      if (result?.code === 'already-present') {
        notify('Esta cancion ya esta en el setlist.', { type: 'error' });
        return;
      }
      setSongSearchTerm('');
      notify('Cancion agregada al setlist.', { type: 'success' });
    } catch (e) {
      console.error("Error agregando cancion de última hora:", e);
      const messages = {
        'functions/permission-denied': 'No tienes permisos para realizar esta accion.',
        'functions/not-found': 'El evento ya no esta disponible.',
        'functions/failed-precondition': 'La cancion o el evento ya no esta disponible.',
        'functions/unauthenticated': 'Debes iniciar sesion para realizar esta accion.'
      };
      notify(messages[e?.code] || 'No se pudo agregar la cancion al setlist.', { type: 'error' });
    }
  };

  const projectBibleDeckSlideAt = async (targetIndex) => {
    const currentState = evento?.projectorState;
    const bible = currentState?.contentType === 'bible' ? currentState.bible : null;
    const slides = Array.isArray(bible?.slides) ? bible.slides : [];
    if (!slides.length) return;
    const currentIndex = Number.isFinite(Number(bible.slideIndex)) ? Number(bible.slideIndex) : 0;
    const nextIndex = Math.max(0, Math.min(Number(targetIndex) || 0, slides.length - 1));
    if (nextIndex === currentIndex) return;
    const slide = slides[nextIndex];
    const now = Date.now();
    try {
      await enqueueProjectionWrite(() => updateDoc(doc(db, 'eventos', eventoId), {
        projectorState: buildCanonicalBibleProjectorState({
          ...currentState,
          title: slide.reference,
          reference: slide.reference,
          translation: slide.translation,
          translationName: slide.translationName,
          content: slide.text,
          bibleSlideIndex: nextIndex,
          bibleSlideCount: slides.length,
          bible: { ...bible, slideIndex: nextIndex, slideCount: slides.length },
          updatedAt: now,
          projectionVersion: now
        })
      }));
    } catch (error) {
      console.error('Error navegando diapositiva biblica:', error);
      notify('No se pudo cambiar la diapositiva.', { type: 'error' });
    }
  };

  const projectBibleDeckSlide = async (delta) => {
    const currentIndex = Number(evento?.projectorState?.bible?.slideIndex || 0);
    await projectBibleDeckSlideAt(currentIndex + delta);
  };

  const isTemporarySetlistItem = (item) => String(item?.idLocal || '').startsWith('extra_');

  const quitarCancionAgregada = async (item, e) => {
    e?.stopPropagation();
    if (!evento || !isTemporarySetlistItem(item)) return;

    try {
      const result = await quitarCancionEnVivo({ eventoId, idLocal: item.idLocal });
      if (result?.clearedActiveSong) {
        setActiveSongId(null);
        setPreviewSlide(null);
        setPreviewMedia(null);
      }
      notify('Cancion quitada del setlist.', { type: 'success' });
    } catch (e) {
      console.error("Error quitando cancion agregada:", e);
      const messages = {
        'functions/permission-denied': 'No tienes permisos para realizar esta accion.',
        'functions/not-found': 'La cancion agregada ya no existe.',
        'functions/failed-precondition': 'Esta cancion no se puede quitar desde el controlador.',
        'functions/unauthenticated': 'Debes iniciar sesion para realizar esta accion.'
      };
      notify(messages[e?.code] || 'No se pudo quitar la cancion del setlist.', { type: 'error' });
    }
  };

  const cancionesAgregadasTemporales = getSetlistSongItems().filter(isTemporarySetlistItem);

  const projectMedia = async (mediaObj) => {
    if (!mediaObj) return;
    rememberUndoSnapshot();
    const updates = buildProjectorMediaPayload({
      media: mediaObj,
      title: mediaObj.name || mediaObj.title || 'Media',
      timer: evento?.proyectorCountdown || null,
      liveState: buildInactiveSongLiveState('media', mediaObj.name || mediaObj.title || 'Multimedia')
    });
    updates.proyectorFondo = null;
    updates.proyectorFondoMedia = null;
    try { await enqueueProjectionWrite(() => updateDoc(doc(db, 'eventos', eventoId), updates)); }
    catch (e) { console.error(e); }
  };

  const projectSectionMedia = (resource) => {
    if (!resource?.url) return;
    projectMedia({
      ...resource,
      name: resource.name || resource.title || 'Multimedia de seccion',
      mode: 'foreground'
    });
  };

  const getMediaIcon = (type) => {
    if (type === 'video') return <Film size={14} className="text-violet-300" />;
    if (type === 'audio') return <Volume2 size={14} className="text-emerald-300" />;
    if (type === 'pdf') return <Layers size={14} className="text-amber-300" />;
    return <ImageIcon size={14} className="text-blue-300" />;
  };

  const handleTransicionChange = async (e) => {
    const nuevaTransicion = e.target.value;
    setTransicionActiva(nuevaTransicion);
    try { await setDoc(doc(db, 'eventos', eventoId), { proyectorTransicion: nuevaTransicion }, { merge: true }); } catch(e) { console.error(e); }
  };

  const toggleBlackout = async () => {
    const nextBlackout = !isBlackout;
    if (!nextBlackout) {
      try {
        await enqueueProjectionWrite(() => runTransaction(db, async (transaction) => {
          const eventRef = doc(db, 'eventos', eventoId);
          const eventSnapshot = await transaction.get(eventRef);
          const previousProjectionFields = eventSnapshot.data()?.projectorState?.previousProjectionFields;
          if (!eventSnapshot.exists() || eventSnapshot.data()?.projectorState?.type !== 'blackout' || !previousProjectionFields) {
            throw new Error('No existe un estado anterior para restaurar.');
          }
          transaction.update(eventRef, buildStoppedBibleProjectionPayload({ previousProjectionFields }));
        }));
      } catch (error) {
        console.error('Error restaurando la proyeccion anterior:', error);
        notify('No se pudo restaurar el estado anterior.', { type: 'error' });
      }
      return;
    }

    const currentBackground = resolveProjectorBackground(evento);
    const previousProjectionFields = capturePreviousProjectionFields(evento);
    rememberUndoSnapshot();
    try {
      await updateDoc(doc(db, 'eventos', eventoId), {
        proyectorApagado: nextBlackout,
        ...(nextBlackout ? {
          liveState: buildInactiveSongLiveState('blackout', 'Pantalla negra'),
          currentSongId: null,
          proyectorSongId: null,
          proyectorSlideIndex: -1,
          proyectorNextSlide: null,
          proyectorNextSong: null
        } : {}),
        projectorState: {
          type: nextBlackout ? 'blackout' : 'resume',
          title: nextBlackout ? 'Pantalla negra' : 'Proyector activo',
          content: '',
          media: null,
          timer: evento?.proyectorCountdown || null,
          background: currentBackground.url,
          backgroundMedia: currentBackground.media,
          previousProjectionFields,
          updatedAt: Date.now()
        }
      });
    } 
    catch (e) { console.error(e); }
  };

  const toggleTransmision = async () => {
    rememberUndoSnapshot();
    try { await setDoc(doc(db, 'eventos', eventoId), { proyectorModoTransmision: !modoTransmision }, { merge: true }); } 
    catch (e) { console.error(e); }
  };

  const toggleLogo = async () => {
    const nextLogo = !isLogoActive;
    const currentBackground = resolveProjectorBackground(evento);
    rememberUndoSnapshot();
    try {
      await updateDoc(doc(db, 'eventos', eventoId), {
        proyectorLogo: nextLogo,
        proyectorApagado: false,
        ...(nextLogo ? {
          liveState: buildInactiveSongLiveState('logo', 'Logo'),
          currentSongId: null,
          proyectorSongId: null,
          proyectorSlideIndex: -1,
          proyectorNextSlide: null,
          proyectorNextSong: null
        } : {}),
        projectorState: {
          type: nextLogo ? 'logo' : 'clearLogo',
          title: nextLogo ? 'Logo' : 'Logo apagado',
          content: '',
          media: null,
          timer: evento?.proyectorCountdown || null,
          background: currentBackground.url,
          backgroundMedia: currentBackground.media,
          updatedAt: Date.now()
        }
      });
    } 
    catch (e) { console.error(e); }
  };

  const handleMediaControl = async (updates) => { // Esta función ya estaba bien
    try {
      const newMedia = { ...mediaActive, ...updates };
      await setDoc(doc(db, 'eventos', eventoId), { proyectorMedia: newMedia }, { merge: true });
    } catch (e) { console.error(e); }
  };

  const handleSeekCommand = async (type) => { // Esta función ya estaba bien
    if (!mediaActive) return;
    try {
      await setDoc(doc(db, 'eventos', eventoId), { proyectorMedia: { ...mediaActive, seekRequest: { type, time: Date.now() } } }, { merge: true });
    } catch (e) { console.error(e); }
  };

  const detenerMedia = async () => {
    rememberUndoSnapshot();
    try {
      const updates = buildStoppedProjectorMediaPayload({
        eventData: evento,
        liveState: buildInactiveSongLiveState('none', 'Sin contenido activo')
      });
      await enqueueProjectionWrite(() => updateDoc(doc(db, 'eventos', eventoId), updates));
      setPreviewMedia(null); // Limpiar también la vista previa local al detener
    } catch (error) {
      console.error('Error deteniendo multimedia:', error);
      notify('No se pudo detener la multimedia.', { type: 'error' });
    }
  };

  const clearPreachingProjection = async () => {
    if (evento?.projectorState?.type !== 'preaching') return;
    const currentBackground = resolveProjectorBackground(evento);
    rememberUndoSnapshot();
    try {
      await updateDoc(doc(db, 'eventos', eventoId), {
        projectorState: {
          type: 'clearPreaching',
          title: 'Predica quitada',
          content: '',
          media: null,
          timer: evento?.proyectorCountdown || null,
          background: currentBackground.url,
          backgroundMedia: currentBackground.media,
          updatedAt: Date.now()
        },
        proyectorSlide: null,
        proyectorMedia: null,
        proyectorApagado: false,
        proyectorLogo: false,
        proyectorFondo: null,
        proyectorFondoMedia: null,
        liveState: buildInactiveSongLiveState('none', 'Sin contenido musical'),
        currentSongId: null,
        proyectorSongId: null,
        proyectorSlideIndex: -1,
        proyectorNextSlide: null,
        proyectorNextSong: null
      });
      notify('Contenido de predica quitado.', { type: 'success' });
    } catch (error) {
      console.error('Error quitando contenido de predica:', error);
      notify('No se pudo quitar el contenido de predica.', { type: 'error' });
    }
  };

  const toggleCountdown = async (active) => {
    const mins = parseInt(countdownMinutes) || 5;
    const endTimestamp = active ? Date.now() + (mins * 60000) : null;
    try {
      await updateDoc(doc(db, 'eventos', eventoId), {
        proyectorCountdown: { active, endTimestamp: endTimestamp }
      });
    } catch (e) { console.error(e); }
  };

  const botonPanico = async () => {
    rememberUndoSnapshot();
    await enqueueProjectionWrite(() => updateDoc(doc(db, 'eventos', eventoId), buildPanicProjectorPayload({
      liveState: buildInactiveSongLiveState('blackout', 'Pantalla negra'),
      previousProjectionFields: captureVisualStateSnapshot()
    })));
    setPreviewMedia(null);
    setLiveSlide(null);
  };

  const borrarArchivo = async (e, url) => {
    e.stopPropagation();
    setConfirmModal({
      show: true,
      title: 'Eliminar Archivo', // Mantener el título para archivos
      message: '¿Estás seguro de que deseas eliminar este archivo de la bóveda? Esta acción no se puede deshacer.',
      onConfirm: async () => {
        const nuevaLib = multimediaLib.filter(m => m.url !== url);
        try {
          await setDoc(doc(db, 'sistema', 'multimedia'), { multimediaLib: nuevaLib }, { merge: true });
        } catch (e) { console.error(e); }
        setConfirmModal({ ...confirmModal, show: false });
      }
    });
  };

  const borrarCarpeta = async (e, folderName) => {
    e.stopPropagation();
    setConfirmModal({
      show: true,
      title: `Eliminar Carpeta "${folderName}"`, // Título específico para carpetas
      message: `¿Deseas eliminar la carpeta "${folderName}"? También se eliminarán todos los archivos vinculados a ella.`,
      onConfirm: async () => {
        const nuevasCarpetas = multimediaFolders.filter(f => f !== folderName);
        const nuevaLib = multimediaLib.filter(m => m.folder !== folderName);
        try {
          await setDoc(doc(db, 'sistema', 'multimedia'), { 
            multimediaFolders: nuevasCarpetas,
            multimediaLib: nuevaLib
          }, { merge: true });
          if (currentFolder === folderName) setCurrentFolder(null);
        } catch (e) { console.error(e); }
        setConfirmModal({ ...confirmModal, show: false });
      }
    });
  };

  const renombrarArchivo = async (e, url) => {
    e.stopPropagation();
    const item = multimediaLib.find(m => m.url === url);
    if (!item) return;

    setInputModal({
      show: true,
      title: 'Renombrar Archivo',
      value: item.name || "",
      error: '',
      onConfirm: async (newName) => {
        if (!newName || newName.trim() === "" || newName.trim() === item.name) {
          setInputModal(prev => ({ ...prev, show: false }));
          return;
        }
        const nuevaLib = multimediaLib.map(m => m.url === url ? { ...m, name: newName.trim() } : m);
        try {
          await setDoc(doc(db, 'sistema', 'multimedia'), { multimediaLib: nuevaLib }, { merge: true });
          setInputModal(prev => ({ ...prev, show: false }));
        } catch (e) { console.error(e); }
      }
    });
  };

  const renombrarCarpeta = async (e, folderName) => {
    e.stopPropagation();
    setInputModal({
      show: true,
      title: 'Renombrar Carpeta',
      value: folderName,
      error: '',
      onConfirm: async (newName) => {
        const trimmedName = newName.trim();
        if (!trimmedName || trimmedName === "" || trimmedName === folderName) {
          setInputModal(prev => ({ ...prev, show: false }));
          return;
        }
        if (multimediaFolders.includes(trimmedName)) {
          setInputModal(prev => ({ ...prev, error: 'Ya existe una carpeta con ese nombre.' }));
          return;
        }
        const nuevasCarpetas = multimediaFolders.map(f => f === folderName ? trimmedName : f);
        const nuevaLib = multimediaLib.map(m => m.folder === folderName ? { ...m, folder: trimmedName } : m);
        try {
          await setDoc(doc(db, 'sistema', 'multimedia'), { multimediaFolders: nuevasCarpetas, multimediaLib: nuevaLib }, { merge: true });
          setInputModal(prev => ({ ...prev, show: false }));
        } catch (e) { console.error(e); }
      }
    });
  };

  const crearCarpeta = async () => {
    setInputModal({
      show: true,
      title: 'Nueva Carpeta',
      value: '',
      error: '',
      onConfirm: async (name) => {
        const trimmedName = name.trim();
        if (!trimmedName) {
          setInputModal(prev => ({ ...prev, show: false }));
          return;
        }
        if (multimediaFolders.includes(trimmedName)) {
          setInputModal(prev => ({ ...prev, error: 'La carpeta ya existe.' }));
          return;
        }
        const nuevasCarpetas = [...multimediaFolders, trimmedName];
        try {
          await setDoc(doc(db, 'sistema', 'multimedia'), { multimediaFolders: nuevasCarpetas }, { merge: true });
          setInputModal(prev => ({ ...prev, show: false }));
        } catch (e) { console.error(e); }
      }
    });
  };

  const handleUploadBackground = async (e, { applyAsBackground = false } = {}) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const uploadId = Date.now();
    const fileType = file.type.startsWith('video') ? 'video' : 'image';
    setUploadingFiles(prev => [...prev, { id: uploadId, name: file.name, type: fileType, folder: currentFolder || 'root' }]);
    setIsUploadingFondo(true);

    try {
      const uploaded = await uploadToCloudinary(file, 'kadosh/projector-backgrounds');
      const url = uploaded.url;
      
      if (url) {
        const uploadedBackgroundMedia = {
          title: file.name,
          name: file.name,
          type: uploaded.type || fileType,
          url,
          source: 'vault'
        };
        const nuevaLib = [...multimediaLib, { 
          url, 
        type: uploaded.type || fileType, 
          name: file.name,
          folder: currentFolder || 'root'
        }];

        await setDoc(doc(db, 'sistema', 'multimedia'), { 
          multimediaLib: nuevaLib 
        }, { merge: true });

        if (applyAsBackground) {
          rememberUndoSnapshot();
          await enqueueProjectionWrite(() => updateDoc(doc(db, 'eventos', eventoId), {
            proyectorFondo: url,
            proyectorFondoMedia: uploadedBackgroundMedia,
            projectorState: {
              ...(evento?.projectorState || {}),
              background: url,
              backgroundMedia: uploadedBackgroundMedia,
              updatedAt: Date.now()
            }
          }));
        }
        
        // Si es una cancion real (no modo global), guardamos la referencia
        if (applyAsBackground && eventoId !== 'global' && activeSongId && guardarEnCancion) {
          await updateSongMetadata(activeSongId, { fondoUrl: url });
          setCanciones(prev => prev.map(c => c.id === activeSongId ? { ...c, fondoUrl: url } : c));
        }
      }
    } catch (err) {
      console.error("Error subiendo fondo", err);
      notify("Hubo un error subiendo el fondo. Inténtalo nuevamente.", { type: 'error' });
    } finally {
      setIsUploadingFondo(false);
      setShowFondosModal(false);
      setUploadingFiles(prev => prev.filter(f => f.id !== uploadId));
      e.target.value = '';
    }
  };

  const quitarFondo = async () => {
    rememberUndoSnapshot();
    await updateDoc(doc(db, 'eventos', eventoId), {
      proyectorFondo: null,
      proyectorFondoMedia: null,
      projectorState: {
        ...(evento?.projectorState || {}),
        background: null,
        backgroundMedia: null,
        updatedAt: Date.now()
      }
    });
    
    if (eventoId !== 'global' && activeSongId && guardarEnCancion) {
      await updateSongMetadata(activeSongId, { fondoUrl: null });
      setCanciones(prev => prev.map(c => c.id === activeSongId ? { ...c, fondoUrl: null } : c));
    }
    setShowFondosModal(false);
  };

  // Lógica para enviar mensajes a tarima
  const enviarAlerta = async (overrideText = null) => {
    const messageText = typeof overrideText === 'string' ? overrideText.trim() : alertaTarima.trim();
    if (!messageText) return;
    setIsSendingAlert(true);
    const now = Date.now();
    const alertDurations = { normal: 7000, importante: 10000, urgente: 16000 };
    const expiresAt = now + (alertDurations[alertaPriority] || alertDurations.normal);
    try {
      rememberUndoSnapshot();
      await setDoc(doc(db, 'eventos', eventoId), {
        proyectorAlerta: {
          text: messageText,
          priority: alertaPriority,
          target: alertaTarget,
          sentAt: now,
          expiresAt,
          active: true,
          sentBy: user?.nombre || user?.email || 'Multimedia'
        }
      }, { merge: true });
      if (!overrideText) setAlertaTarima('');
      setTimeout(async () => {
        const snap = await getDoc(doc(db, 'eventos', eventoId));
        const currentAlert = snap.exists() ? snap.data().proyectorAlerta : null;
        if (currentAlert?.sentAt === now) {
          await setDoc(doc(db, 'eventos', eventoId), { proyectorAlerta: null }, { merge: true });
        }
      }, (alertDurations[alertaPriority] || alertDurations.normal) + 250);
    } catch (e) { console.error(e); } finally { setIsSendingAlert(false); }
  };
  const limpiarAlerta = async () => {
    rememberUndoSnapshot();
    await setDoc(doc(db, 'eventos', eventoId), { proyectorAlerta: null }, { merge: true });
  };

  // Lógica para enviar Marquesina (Ticker) Público
  const enviarTicker = async () => {
    if (!tickerMsg.trim()) return;
    setIsSendingTicker(true);
    try {
      rememberUndoSnapshot();
      await setDoc(doc(db, 'eventos', eventoId), { proyectorTicker: tickerMsg }, { merge: true });
      setTickerMsg('');
    } 
    catch (e) { console.error(e); } finally { setIsSendingTicker(false); }
  };
  const limpiarTicker = async () => {
    rememberUndoSnapshot();
    await setDoc(doc(db, 'eventos', eventoId), { proyectorTicker: null }, { merge: true });
  };

  // Filtrar archivos para el buscador
  const filteredMedia = multimediaLib.filter(m => {
    const matchFolder = (m.folder || 'root') === (currentFolder || 'root');
    const name = (m.name || '').toLowerCase();
    const search = searchTerm.toLowerCase();
    return matchFolder && name.includes(search);
  });

  if (loading) return <div className="min-h-screen bg-zinc-950 flex justify-center items-center text-zinc-500 font-bold">Cargando Controlador...</div>;

  let animationClass = '';
  if (transicionActiva !== 'none') {
    const baseTransition = transicionActiva === 'fade' 
      ? 'transition-all duration-[250ms] ease-in-out' 
      : 'transition-all duration-[150ms] ease-in-out';
      
    if (fadeState === 'out') {
      if (transicionActiva === 'slide') animationClass = `${baseTransition} opacity-0 translate-y-4`;
      else if (transicionActiva === 'zoom') animationClass = `${baseTransition} opacity-0 scale-95`;
      else animationClass = `${baseTransition} opacity-0`;
    } else {
      if (transicionActiva === 'slide') animationClass = `${baseTransition} opacity-100 translate-y-0`;
      else if (transicionActiva === 'zoom') animationClass = `${baseTransition} opacity-100 scale-100`;
      else animationClass = `${baseTransition} opacity-100`;
    }
  }

  const previewSectionMedia = Array.isArray(previewSlide?.media) ? previewSlide.media.find(resource => resource?.url) : null;
  const previewBackground = previewSectionMedia?.url || fondoActivo;
  const projectedBibleOutlineItemId = evento?.projectorState?.contentType === 'bible'
    ? evento?.projectorState?.bible?.outlineItemId
    : null;
  const isBiblePreviewProjected = Boolean(
    biblePreviewOutlineItemId
    && projectedBibleOutlineItemId === biblePreviewOutlineItemId
    && Number(biblePreview?.selectedIndex || 0) === Number(evento?.projectorState?.bible?.slideIndex || 0)
  );
  const biblePreviewSlides = Array.isArray(biblePreview?.slides) ? biblePreview.slides : [];
  const biblePreviewIndex = Math.max(0, Math.min(Number(biblePreview?.selectedIndex || 0), Math.max(biblePreviewSlides.length - 1, 0)));
  const biblePreviewSlide = biblePreviewSlides[biblePreviewIndex] || null;
  const preachingSelectionPanel = (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
      <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-zinc-500">Seleccion local</p>
      <select value={selectedPreachingBlock?.id || ''} onChange={event => selectPreachingBlock(event.target.value)} className="w-full rounded-xl border border-white/10 bg-zinc-950 px-3 py-2 text-xs font-bold text-white">
        {publicProjectableBlocks.map((block, index) => <option key={block.id || index} value={block.id}>{index + 1}. {block.reference || block.title || block.type}</option>)}
      </select>

      {selectedPreachingBibleSlide ? (
        <div className="mt-3 rounded-xl border border-blue-400/20 bg-blue-500/10 p-3">
          <p className="text-xs font-black text-blue-50">{selectedPreachingBibleSlide.reference}</p>
          <p className="mt-2 whitespace-pre-wrap text-xs font-bold leading-relaxed text-blue-50/85">{selectedPreachingBibleSlide.text}</p>
          <div className="mt-3 grid grid-cols-[auto_1fr_auto] items-center gap-2">
            <button type="button" aria-label="Versiculo anterior" disabled={safePreachingBiblePreviewIndex === 0} onClick={() => setPreachingBiblePreviewIndex(index => normalizePreachingBiblePreviewIndex(selectedPreachingBibleSlides, index - 1))} className="rounded-lg border border-white/10 p-2 disabled:opacity-30"><ChevronLeft size={15} /></button>
            <span className="text-center text-[10px] font-black text-blue-100">{safePreachingBiblePreviewIndex + 1} / {selectedPreachingBibleSlides.length}</span>
            <button type="button" aria-label="Versiculo siguiente" disabled={safePreachingBiblePreviewIndex >= selectedPreachingBibleSlides.length - 1} onClick={() => setPreachingBiblePreviewIndex(index => normalizePreachingBiblePreviewIndex(selectedPreachingBibleSlides, index + 1))} className="rounded-lg border border-white/10 p-2 disabled:opacity-30"><ChevronRight size={15} /></button>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {selectedPreachingBibleSlides.map((slide, index) => {
              const projected = evento?.projectorState?.contentType === 'bible'
                && evento?.projectorState?.passageId === selectedPreachingBiblePreview?.passage?.passageId
                && Number(evento?.projectorState?.bible?.slideIndex || 0) === index;
              return (
                <button key={`${slide.reference}-${index}`} type="button" onClick={() => setPreachingBiblePreviewIndex(normalizePreachingBiblePreviewIndex(selectedPreachingBibleSlides, index))} aria-pressed={safePreachingBiblePreviewIndex === index} className={`min-h-9 min-w-9 rounded-lg border px-2 text-[10px] font-black ${safePreachingBiblePreviewIndex === index ? 'border-blue-200 bg-blue-600 text-white' : projected ? 'border-emerald-300 bg-emerald-500/20 text-emerald-100' : 'border-white/10 bg-black/20 text-zinc-300'}`}>
                  {slide.verseNumber ?? index + 1}
                </button>
              );
            })}
          </div>
          <button type="button" onClick={() => projectPreachingBlockFromController(selectedPreachingBlock, safePreachingBiblePreviewIndex)} className="mt-3 w-full rounded-xl bg-blue-600 px-3 py-2 text-[10px] font-black uppercase text-white hover:bg-blue-500">Proyectar</button>
        </div>
      ) : (
        <>
          <p className="mt-2 line-clamp-2 text-xs font-bold text-zinc-300">{selectedPreachingBlock?.content || selectedPreachingBlock?.text || selectedPreachingBlock?.title || 'Sin bloque seleccionado'}</p>
          <div className="mt-3 grid grid-cols-[auto_1fr_auto] gap-2">
            <button type="button" aria-label="Elemento anterior" disabled={selectedPreachingBlockIndex <= 0} onClick={() => selectPreachingBlock(publicProjectableBlocks[selectedPreachingBlockIndex - 1]?.id)} className="rounded-xl border border-white/10 px-3 py-2 disabled:opacity-30"><ChevronLeft size={15} /></button>
            <button type="button" disabled={!selectedPreachingBlock} onClick={() => projectPreachingBlockFromController(selectedPreachingBlock)} className="rounded-xl bg-emerald-600 px-3 py-2 text-[10px] font-black uppercase text-white hover:bg-emerald-500 disabled:opacity-40">Proyectar</button>
            <button type="button" aria-label="Elemento siguiente" disabled={selectedPreachingBlockIndex >= publicProjectableBlocks.length - 1} onClick={() => selectPreachingBlock(publicProjectableBlocks[selectedPreachingBlockIndex + 1]?.id)} className="rounded-xl border border-white/10 px-3 py-2 disabled:opacity-30"><ChevronRight size={15} /></button>
          </div>
        </>
      )}
      {evento?.projectorState?.contentType === 'bible' && (
        <button type="button" onClick={stopPublicBibleProjection} className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-[10px] font-black uppercase text-amber-100 hover:bg-amber-500/20">
          <PowerOff size={15} /> Dejar de proyectar Biblia
        </button>
      )}
    </div>
  );
  const bibleOutlinePanel = (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-blue-400/20 bg-blue-500/10 p-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-blue-300">Bosquejo biblico</p>
          <h2 className="mt-1 text-lg font-black text-white">Pasajes preparados</h2>
          <p className="mt-1 text-xs font-bold text-blue-100/65">Preparar no cambia la pantalla publica.</p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {(biblePreview || lastBiblePassage) && (
            <button type="button" onClick={clearLocalBibleControl} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/15 bg-black/25 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-blue-100 hover:bg-white/10">
              <X size={15} /> Cerrar preview
            </button>
          )}
          {evento?.projectorState?.contentType === 'bible' && (
            <button type="button" onClick={stopPublicBibleProjection} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-amber-100 hover:bg-amber-500/20">
              <PowerOff size={15} /> Dejar de proyectar Biblia
            </button>
          )}
          {canManageBibleOutline && eventoId !== 'global' && (
            <button type="button" onClick={() => openBibleOutlinePicker()} disabled={isSavingBibleOutline} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-white hover:bg-blue-500 disabled:opacity-50">
              <Plus size={15} /> Agregar pasaje
            </button>
          )}
        </div>
      </div>
      {biblePreviewSlide && (
        <section className="rounded-2xl border border-blue-400/25 bg-blue-500/10 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-blue-200">Preview</p>
              <p className="truncate text-xs font-black text-white">{biblePreviewSlide.reference}</p>
            </div>
            <span className={`shrink-0 rounded-full border px-2 py-1 text-[9px] font-black uppercase ${isBiblePreviewProjected ? 'border-emerald-400/35 bg-emerald-500/15 text-emerald-100' : 'border-blue-400/25 bg-black/20 text-blue-100'}`}>
              {isBiblePreviewProjected ? 'En proyeccion' : 'Local'}
            </span>
          </div>
          {biblePreviewSlide.heading && <p className="mb-2 text-xs font-black uppercase tracking-wide text-blue-100">{biblePreviewSlide.heading}</p>}
          <p className="whitespace-pre-wrap text-sm font-black leading-relaxed text-white">{biblePreviewSlide.text}</p>
          {biblePreviewSlides.length > 1 && (
            <div className="mt-4 space-y-2 rounded-xl border border-white/10 bg-black/20 p-1">
              <div className="flex items-center justify-between gap-2">
                <button type="button" onClick={() => moveBiblePreviewSlide(-1)} disabled={biblePreviewIndex === 0} className="inline-flex min-h-10 items-center gap-1 rounded-lg px-3 text-[10px] font-black uppercase text-blue-100 disabled:opacity-30"><ChevronLeft size={16} /> Anterior</button>
                <span className="text-[10px] font-black text-blue-100">{biblePreviewIndex + 1} / {biblePreviewSlides.length}</span>
                <button type="button" onClick={() => moveBiblePreviewSlide(1)} disabled={biblePreviewIndex >= biblePreviewSlides.length - 1} className="inline-flex min-h-10 items-center gap-1 rounded-lg px-3 text-[10px] font-black uppercase text-blue-100 disabled:opacity-30">Siguiente <ChevronRight size={16} /></button>
              </div>
              <div className="grid grid-cols-5 gap-1 px-1 pb-1 sm:grid-cols-8 xl:grid-cols-10">
                {biblePreviewSlides.map((slide, index) => {
                  const isSelected = biblePreviewIndex === index;
                  const isProjected = projectedBibleOutlineItemId === biblePreviewOutlineItemId
                    && Number(evento?.projectorState?.bible?.slideIndex || 0) === index;
                  return (
                    <button key={`${slide.reference || 'biblia'}-${index}`} type="button" onClick={() => selectBiblePreviewSlide(index)} aria-pressed={isSelected} title={isProjected ? `${slide.reference} - En proyeccion` : slide.reference} className={`min-h-10 rounded-lg border text-xs font-black ${isSelected ? 'border-blue-200 bg-blue-600 text-white' : isProjected ? 'border-emerald-300/70 bg-emerald-500/20 text-emerald-100 ring-1 ring-emerald-300/60' : 'border-white/10 bg-black/20 text-zinc-400 hover:bg-white/10 hover:text-white'}`}>
                      {slide.verseNumber ?? index + 1}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <button type="button" onClick={() => projectBiblePassage({ ...biblePreview, selectedIndex: biblePreviewIndex, outlineItemId: biblePreviewOutlineItemId })} className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-xs font-black uppercase tracking-wide text-white hover:bg-blue-500"><Monitor size={16} /> Proyectar Biblia</button>
        </section>
      )}
      {eventoId === 'global' ? (
        <p className="rounded-2xl border border-dashed border-zinc-700 bg-black/20 p-4 text-sm font-bold text-zinc-500">Selecciona un evento para preparar un bosquejo biblico.</p>
      ) : bibleOutlineItems.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-7 text-center">
          <BookOpen className="mx-auto mb-3 text-zinc-600" size={32} />
          <p className="font-black text-white">Aun no hay pasajes preparados.</p>
          <p className="mt-1 text-xs font-bold text-zinc-500">Agrega los pasajes que necesitaras durante el culto.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {bibleOutlineItems.map((item, index) => {
            const isProjected = projectedBibleOutlineItemId === item.id;
            const isPreviewed = biblePreview?.passage?.passageId === item.passage?.passageId;
            return (
              <article key={item.id} className={`rounded-2xl border p-3 ${isProjected ? 'border-emerald-400/45 bg-emerald-500/10' : 'border-white/10 bg-zinc-950/55'}`}>
                <div className="flex items-start gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-black/30 text-xs font-black text-blue-200">{index + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-black text-white">{item.passage?.reference || 'Pasaje sin referencia'}</p>
                      <span className={`rounded-full border px-2 py-0.5 text-[9px] font-black uppercase ${isProjected ? 'border-emerald-400/35 bg-emerald-500/15 text-emerald-100' : isPreviewed ? 'border-blue-400/35 bg-blue-500/15 text-blue-100' : 'border-zinc-600 bg-white/5 text-zinc-400'}`}>
                        {isProjected ? 'En proyeccion' : isPreviewed ? 'Previsualizado' : 'Preparado'}
                      </span>
                    </div>
                    <p className="mt-1 text-[10px] font-bold text-zinc-500">{item.passage?.abbreviation || 'Biblia'} - {item.passage?.translationName || 'Traduccion local'} - {item.slides?.length || 0} diapositivas</p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={() => previewBibleOutlineItem(item)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-blue-400/25 bg-blue-500/10 px-3 py-2 text-[9px] font-black uppercase text-blue-100 hover:bg-blue-500/20"><Eye size={13} /> Previsualizar</button>
                  <button type="button" onClick={() => projectBibleOutlineItem(item)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-[9px] font-black uppercase text-white hover:bg-blue-500"><Monitor size={13} /> Proyectar</button>
                  {canManageBibleOutline && (
                    <>
                      <button type="button" onClick={() => openBibleOutlinePicker(item)} disabled={isSavingBibleOutline} aria-label={`Editar ${item.passage?.reference || 'pasaje'}`} title="Editar pasaje" className="inline-flex min-h-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 px-2 text-zinc-300 hover:bg-white/10 disabled:opacity-50"><Edit2 size={14} /></button>
                      <button type="button" onClick={() => moveBibleOutlineItem(item.id, -1)} disabled={isSavingBibleOutline || index === 0} aria-label="Subir pasaje" title="Subir" className="inline-flex min-h-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 px-2 text-zinc-300 hover:bg-white/10 disabled:opacity-30"><ChevronLeft className="rotate-90" size={14} /></button>
                      <button type="button" onClick={() => moveBibleOutlineItem(item.id, 1)} disabled={isSavingBibleOutline || index === bibleOutlineItems.length - 1} aria-label="Bajar pasaje" title="Bajar" className="inline-flex min-h-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 px-2 text-zinc-300 hover:bg-white/10 disabled:opacity-30"><ChevronRight className="rotate-90" size={14} /></button>
                      <button type="button" onClick={() => requestRemoveBibleOutlineItem(item)} disabled={isSavingBibleOutline} aria-label={`Eliminar ${item.passage?.reference || 'pasaje'}`} title="Eliminar pasaje" className="inline-flex min-h-9 items-center justify-center rounded-lg border border-red-400/20 bg-red-500/10 px-2 text-red-200 hover:bg-red-500/20 disabled:opacity-50"><Trash2 size={14} /></button>
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
      <QuickMessagePanel
        active={canQuickProject}
        history={evento?.quickMessageHistory}
        onProject={projectQuickMessage}
        onClear={clearQuickMessageProjection}
        onRemoveHistoryEntry={(entryId) => updateQuickMessageHistory({ operation: 'remove', entryId })}
        onClearHistory={() => updateQuickMessageHistory({ operation: 'clear' })}
      />
    </div>
  );
  const screensMenu = showScreensMenu && screensMenuPosition && typeof document !== 'undefined'
    ? createPortal(
      <div
        ref={screensMenuRef}
        role="menu"
        className="fixed z-50 w-80 overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/95 p-2 shadow-2xl shadow-black/50 backdrop-blur-xl"
        style={{ top: screensMenuPosition.top, left: screensMenuPosition.left }}
      >
        <p className="px-3 pb-2 pt-1 text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">Abrir pantalla</p>
        {controllerScreens.map(({ id, label, detail, Icon, path }) => (
          <button
            key={id}
            type="button"
            role="menuitem"
            onClick={() => openControllerScreen(path)}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-white/10"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-violet-400/20 bg-violet-500/10 text-violet-200"><Icon size={16} /></span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-black text-white">{label}</span>
              <span className="block truncate text-[10px] font-bold text-zinc-500">{detail}</span>
            </span>
            <span className="text-[10px] font-black uppercase tracking-wide text-violet-300">Abrir</span>
          </button>
        ))}
      </div>,
      document.body
    )
    : null;

  return (
    <div className="relative h-[100dvh] min-h-0 bg-zinc-950 flex flex-col text-white font-sans overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(124,58,237,0.16),transparent_32%),linear-gradient(rgba(255,255,255,0.026)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.026)_1px,transparent_1px)] bg-[size:auto,88px_88px,88px_88px]" />
      {/* Cabecera */}
      <header className="relative z-30 h-16 shrink-0 overflow-visible border-b border-white/10 bg-zinc-950/88 flex items-center justify-between px-3 sm:px-6 shadow-[0_10px_40px_rgba(0,0,0,0.25)] backdrop-blur-md">
        <div className="flex items-center gap-2 sm:gap-4 min-w-0">
            <button onClick={() => navigate(returnTo)} className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors shrink-0">
              <ArrowLeft size={20} />
            </button>
            <div className="truncate">
              <h1 className="font-bold text-lg flex items-center gap-2 text-white">
                <Monitor size={18} className="text-violet-500"/> 
                Kadosh Pro
              </h1>
              <p className="text-[10px] text-zinc-500 font-bold truncate">{evento?.titulo}</p>
            </div>
          </div>
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <button
            type="button"
            onClick={undoLastSend}
            disabled={!canUndoLastSend || isUndoingLastSend}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-black uppercase tracking-wide border transition-all active:scale-95 disabled:active:scale-100 ${
              canUndoLastSend
                ? 'bg-zinc-800/90 text-zinc-100 border-zinc-600 hover:bg-zinc-700'
                : 'bg-zinc-900/60 text-zinc-600 border-zinc-800 cursor-not-allowed'
            }`}
            title={canUndoLastSend ? 'Deshacer último envío' : 'No hay envío para deshacer'}
          >
            {isUndoingLastSend ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
            <span className="hidden sm:inline">Deshacer</span>
          </button>
          {evento?.projectorState?.type === 'preaching' && (
            <button
              type="button"
              onClick={clearPreachingProjection}
              className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-black uppercase tracking-wide border border-amber-500/30 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20 active:scale-95"
              title="Quitar contenido de predica"
            >
              <X size={14} />
              <span>Quitar predica</span>
            </button>
          )}
          <button 
            onClick={() => setShowEventList(!showEventList)}
            className="flex items-center gap-2 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-xs font-bold transition-all border border-zinc-700"
          >
            <Layers size={14} className="text-blue-400"/>
            <span className="hidden lg:inline">Cambiar Evento</span>
          </button>
          <div className="hidden lg:block">
            <button
              ref={screensMenuButtonRef}
              type="button"
              onClick={() => {
                if (!showScreensMenu) updateScreensMenuPosition();
                setShowScreensMenu(prev => !prev);
              }}
              aria-expanded={showScreensMenu}
              aria-haspopup="menu"
              className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs font-black uppercase tracking-wide text-zinc-100 transition-colors hover:bg-zinc-700"
            >
              <Monitor size={15} className="text-violet-300" />
              Pantallas
              <ChevronRight size={14} className={`transition-transform ${showScreensMenu ? 'rotate-90' : ''}`} />
            </button>
          </div>
          <div className="hidden md:flex items-center gap-2 bg-zinc-800/50 px-3 py-1.5 rounded-lg border border-zinc-700"> {/* Desktop only */}
            <span className="text-xs text-zinc-400 font-bold">Animación:</span>
            <select 
              value={transicionActiva} 
              onChange={handleTransicionChange}
              className="bg-transparent text-sm font-bold text-white outline-none cursor-pointer"
            >
              <option value="fade" className="bg-zinc-900">Suave (Fade)</option>
              <option value="slide" className="bg-zinc-900">Deslizar</option>
              <option value="zoom" className="bg-zinc-900">Zoom In</option>
              <option value="none" className="bg-zinc-900">Sin Animación</option>
            </select>
          </div>
          <button onClick={toggleTransmision} className={`hidden md:flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-lg font-bold text-xs sm:text-sm transition-all border ${modoTransmision ? 'bg-emerald-600 text-white border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.4)] animate-pulse' : 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700'}`}> {/* Desktop only */}
            <Tv size={16}/> <span className="hidden sm:inline">{modoTransmision ? 'Modo OBS' : 'Transmisión'}</span>
          </button>
          <button onClick={toggleBlackout} className={`hidden md:flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-lg font-bold text-xs sm:text-sm transition-all ${isBlackout ? 'bg-red-600 text-white animate-pulse shadow-[0_0_15px_rgba(220,38,38,0.4)]' : 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700'}`}> {/* Desktop only */}
            <PowerOff size={16}/> <span className="hidden sm:inline">{isBlackout ? 'Apagado' : 'Apagar'}</span>
          </button>
          <button onClick={botonPanico} className="hidden md:flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold text-xs sm:text-sm transition-all shadow-lg shadow-red-900/20 border border-red-500"> {/* Desktop only */}
            <Zap size={16} fill="currentColor"/> <span className="hidden sm:inline">PANIC</span>
          </button>
          {/* NEW: Mobile Controls FAB for small screens */}
          <button
            onClick={() => setShowMobileControlsModal(true)}
            className={`md:hidden px-3 py-2 rounded-lg shadow-md transition-all active:scale-95 flex items-center gap-2 text-xs font-black uppercase ${evento?.proyectorCountdown?.active ? 'bg-emerald-600 text-white ring-2 ring-emerald-300/50 animate-pulse' : 'bg-violet-600 hover:bg-violet-500 text-white'}`}
            title={evento?.proyectorCountdown?.active ? 'Cronómetro activo' : 'Controles'}
          >
            <Settings2 size={20} />
            {evento?.proyectorCountdown?.active && <span>{countdownTimeLeft || 'Activo'}</span>}
          </button>
        </div>
      </header>

      <section className="relative z-10 shrink-0 border-b border-white/10 bg-zinc-950/72 px-3 py-2 backdrop-blur-md sm:px-6">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="text-[9px] font-black uppercase tracking-[0.22em] text-zinc-500">En pantalla ahora</p>
            <p className="truncate text-xs font-black text-white sm:text-sm">{screenNow.label}</p>
            {screenNow.actor && <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-600">Controlado por: {screenNow.actor}</p>}
          </div>
          <div className="grid grid-cols-4 gap-1 rounded-2xl border border-white/10 bg-black/30 p-1">
            {[
              ['songs', 'Canciones', Music],
              ['preaching', 'Predica', ShieldCheck],
              ['bible', 'Biblia', BookOpen],
              ['media', 'Multimedia', Film]
            ].map(([mode, label, Icon]) => (
              <button
                key={mode}
                type="button"
                onClick={() => setProjectionSourceMode(mode)}
                className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-[10px] font-black uppercase transition-colors ${projectionSourceMode === mode ? 'bg-violet-600 text-white' : 'text-zinc-500 hover:bg-white/5 hover:text-zinc-200'}`}
              >
                <Icon size={13} /> {label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* VISTA PC: 3 Columnas (Se oculta en móviles) */}
      <div className="relative z-10 hidden min-h-0 md:flex flex-1 overflow-hidden [@media_(orientation:landscape)_and_(max-height:500px)]:hidden">
        {/* Columna Izquierda: Setlist */}
        <div className="w-1/4 min-w-[250px] min-h-0 bg-zinc-950/55 border-r border-white/10 flex flex-col backdrop-blur-sm">
          <div className="p-4 border-b border-white/10 bg-zinc-950/65">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={14} />
              <input 
                type="text"
                value={songSearchTerm}
                onChange={(e) => setSongSearchTerm(e.target.value)}
                placeholder="Buscar por titulo, artista o letra..."
                className="w-full bg-zinc-950 border border-zinc-700 rounded-xl pl-9 pr-4 py-2 text-xs focus:border-violet-500 outline-none transition-all"
              />
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3 space-y-1 [&::-webkit-scrollbar]:hidden">
            {songSearchTerm.trim() !== '' ? (
              <div className="space-y-2 animate-in fade-in duration-200">
                <p className="text-[10px] font-black text-violet-400 uppercase tracking-widest px-1 flex justify-between">
                  Resultados Globales {isSearchingGlobal && <Loader2 size={10} className="animate-spin"/>}
                </p>
                {globalSearchResults.map(song => {
                  const searchMatch = getSongSearchMatch(song, songSearchTerm);
                  return (
                  <button 
                    key={song.id}
                    onClick={() => agregarCancionAlSetlist(song)}
                    className="w-full text-left p-3 rounded-xl bg-violet-600/10 border border-violet-500/30 hover:bg-violet-600/20 transition-all group flex justify-between items-center gap-3"
                  >
                    <div className="min-w-0">
                      <p className="font-bold text-xs truncate text-white">{song.titulo}</p>
                      <p className="text-[10px] text-zinc-500 truncate">{song.artista}</p>
                      {searchMatch.field === 'lyrics' && searchMatch.snippet && (
                        <p className="mt-1 line-clamp-2 text-[10px] font-bold leading-snug text-emerald-300">
                          Letra: {searchMatch.snippet}
                        </p>
                      )}
                    </div>
                    <Plus size={14} className="text-violet-400 group-hover:scale-125 transition-transform" />
                  </button>
                );
                })}
                {globalSearchResults.length === 0 && !isSearchingGlobal && (
                  <p className="text-[10px] text-zinc-600 italic text-center py-4">No se encontraron canciones</p>
                )}
                <div className="h-px bg-zinc-800 my-4"></div>
              </div>
            ) : null}

            <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1 mb-2">Setlist Actual</p>

            {eventoId === 'global' ? (
              <div className="space-y-3">
                <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1">Cargar Setlist</p>
                {upcomingEvents.map(ev => (
                  <button key={ev.id} onClick={() => navigate(`/control-proyector/${ev.id}`)} className="w-full text-left p-3 rounded-xl bg-zinc-800/30 border border-zinc-700 hover:border-violet-500 transition-all group">
                    <p className="font-bold text-xs truncate">{ev.titulo}</p>
                    <p className="text-[10px] text-zinc-500 group-hover:text-zinc-300">{formatFriendlyDate(ev.fecha)}</p>
                  </button>
                ))}
              </div>
            ) : (() => {
              const setlistItems = getEventSetlistItems(evento);
              return setlistItems.filter(i => i.type === 'song').map((item, idx) => {
                const c = canciones.find(c => c.id === item.value);
                if (!c) return null;
                return (
                  <div key={item.idLocal || `${c.id}-${idx}`} className={`flex items-stretch gap-2 rounded-xl border ${activeSongId === c.id ? 'border-violet-500/50 bg-violet-600/10 text-white shadow-sm' : 'border-transparent text-zinc-400'}`}>
                    <button 
                      onClick={() => handleSelectSong(c)}
                      className="min-w-0 flex-1 rounded-xl p-3 text-left transition-all hover:bg-zinc-800/50 hover:text-zinc-200"
                    >
                      <p className="font-bold text-sm truncate">{idx + 1}. {c.titulo}</p>
                      <p className="text-xs opacity-70 truncate">{c.artista}</p>
                    </button>
                    {isTemporarySetlistItem(item) && (
                      <button
                        type="button"
                        onClick={(e) => quitarCancionAgregada(item, e)}
                        className="my-2 mr-2 shrink-0 rounded-xl border border-red-500/25 bg-red-500/10 px-2 text-[9px] font-black uppercase text-red-300 hover:bg-red-500/20"
                        title="Quitar cancion agregada"
                      >
                        Quitar
                      </button>
                    )}
                  </div>
                );
              });
            })()}
          </div>
        </div>

        {/* Columna Central: Diapositivas */}
        <div className="min-h-0 min-w-0 flex-1 bg-zinc-950/35 flex flex-col border-r border-white/10">
          <div className="p-4 border-b border-white/10 bg-zinc-950/65 flex justify-between items-center backdrop-blur-sm">
            <h2 className="font-bold text-sm flex items-center gap-2">
              {projectionSourceMode === 'media' ? <Film size={16} className="text-indigo-400"/> : projectionSourceMode === 'songs' ? <Type size={16} className="text-amber-500"/> : <BookOpen size={16} className="text-blue-400"/>}
              {projectionSourceMode === 'media' ? 'Multimedia' : projectionSourceMode === 'preaching' ? 'Predica' : projectionSourceMode === 'bible' ? 'Biblia' : 'Diapositivas'}
              {projectionSourceMode === 'songs' && activeSong && <span className="text-zinc-500">- {activeSong.titulo}</span>}
            </h2>
          </div>
          <div className="min-h-0 flex-1 flex flex-col overflow-hidden">
            
            {/* 📺 NUEVO: PANEL DE MULTIMEDIA RÁPIDA (Bóveda) */}
            {projectionSourceMode === 'media' && (
            <div className="min-h-0 flex-1 overflow-y-auto bg-zinc-950/45 border-b border-white/10 p-4 [&::-webkit-scrollbar]:hidden">
              <div className="flex justify-between items-center mb-3">
                <div className="flex items-center gap-2">
                  <div className="relative mr-2">
                    <input 
                      type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                      placeholder="Buscar en bóveda..."
                      className="bg-zinc-950/80 border border-white/10 rounded-xl px-2 py-1.5 text-[10px] w-32 focus:border-indigo-500 outline-none transition-all"
                    />
                  </div>
                  {currentFolder && (
                    <button onClick={() => setCurrentFolder(null)} className="p-1 bg-zinc-800 hover:bg-zinc-700 rounded text-zinc-400 transition-colors">
                      <ChevronLeft size={14}/>
                    </button>
                  )}
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-500 flex items-center gap-2">
                    <Folder size={12} className="text-amber-500"/> {currentFolder ? `Bóveda / ${currentFolder}` : 'Bóveda de Medios'}
                  </h3>
                </div>
                <div className="flex gap-3">
                  <button onClick={crearCarpeta} className="text-[10px] font-bold text-amber-500 hover:text-amber-400 flex items-center gap-1"><FolderPlus size={12}/> Nueva Carpeta</button>
                  <button onClick={() => setShowFondosModal(true)} className="text-[10px] font-bold text-indigo-400 hover:text-indigo-300 flex items-center gap-1"><Upload size={12}/> Subir Medios</button>
                </div>
              </div>

              <div className="flex gap-3 overflow-x-auto pb-2 [&::-webkit-scrollbar]:hidden">
                {/* Mostrar Carpetas si estamos en el Root */}
                {!currentFolder && multimediaFolders
                  .filter(f => f.toLowerCase().includes(searchTerm.toLowerCase())) // 🔍 Filtrar carpetas también
                  .map((folder, i) => (
                  <div key={`folder-${i}`} className="group relative shrink-0">
                    <button 
                      onClick={() => setCurrentFolder(folder)}
                      className="group flex flex-col items-center gap-1"
                    >
                      <div className="w-24 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center group-hover:bg-amber-500/20 transition-all shadow-[0_12px_30px_rgba(0,0,0,0.18)]">
                        <Folder size={32} className="text-amber-500" fill="currentColor" fillOpacity={0.2}/>
                      </div>
                      <p className="text-[9px] font-bold text-zinc-400 truncate w-24 text-center">{folder}</p>
                    </button>
                    <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-all z-10">
                      <button 
                        onClick={(e) => renombrarCarpeta(e, folder)}
                        className="p-1 bg-zinc-900/80 text-zinc-400 hover:text-indigo-400 rounded-md shadow-lg"
                      >
                        <Edit2 size={10} />
                      </button>
                      <button 
                        onClick={(e) => borrarCarpeta(e, folder)}
                        className="p-1 bg-zinc-900/80 text-zinc-400 hover:text-red-500 rounded-md shadow-lg"
                      >
                        <X size={10} />
                      </button>
                    </div>
                  </div>
                ))}

                {/* Indicadores de carga individuales */}
                {uploadingFiles.filter(f => f.folder === (currentFolder || 'root')).map((f) => (
                  <div key={f.id} className="shrink-0 flex flex-col items-center gap-1">
                    <div className="w-24 h-16 rounded-lg bg-zinc-800 border border-zinc-700 flex flex-col items-center justify-center relative overflow-hidden">
                      <div className="absolute inset-0 bg-indigo-500/10 animate-pulse"></div>
                      <Loader2 size={16} className="text-indigo-500 animate-spin mb-1 z-10" />
                      <span className="text-[8px] text-indigo-400 font-bold z-10">SUBIENDO</span>
                    </div>
                    <p className="text-[8px] text-zinc-600 truncate w-24 text-center">{f.name}</p>
                  </div>
                ))}

                {/* Mostrar Archivos filtrados por carpeta */}
                {filteredMedia.map((m, i) => (
                  <div key={i} className="group relative shrink-0">
                    <button 
                      onClick={() => setPreviewMedia({ url: m.url, type: m.type, mode: 'foreground', name: m.name })}
                      className={`w-24 h-16 rounded-2xl overflow-hidden border transition-all bg-black relative ${previewMedia?.url === m.url ? 'border-indigo-500 ring-2 ring-indigo-500/30' : 'border-white/10 hover:border-indigo-400'}`}
                    >
                      {m.type === 'video' ? <video src={m.url} className="w-full h-full object-cover opacity-60" /> : <img src={m.url} className="w-full h-full object-cover opacity-60" />}
                      <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Play size={16} className="text-white"/>
                      </div>
                    </button>
                    {/* Botón de Lupa para Previsualización Grande */}
                    <button 
                      onClick={(e) => { e.stopPropagation(); setLargePreview(m); }}
                      className="absolute bottom-1 left-1 p-1 bg-zinc-900/80 text-zinc-300 rounded-md opacity-0 group-hover:opacity-100 transition-all border border-white/10"
                      title="Vista Previa Grande"
                    >
                      <Eye size={10} />
                    </button>
                    <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                      <button 
                        onClick={(e) => renombrarArchivo(e, m.url)}
                        className="p-1 bg-zinc-900/80 text-zinc-400 hover:text-indigo-400 rounded-md shadow-lg"
                      >
                        <Edit2 size={10} />
                      </button>
                      <button 
                        onClick={(e) => borrarArchivo(e, m.url)}
                        className="p-1 bg-zinc-900/80 text-zinc-400 hover:text-red-500 rounded-md shadow-lg"
                      >
                        <Trash2 size={10} />
                      </button>
                    </div>
                    <p className="text-[8px] text-zinc-500 mt-1 truncate w-24 text-center">{m.name || 'Sin nombre'}</p>
                  </div>
                ))}
                {filteredMedia.length === 0 && !currentFolder && multimediaFolders.length === 0 && <p className="text-xs text-zinc-700 italic">No hay medios guardados aún.</p>}
              </div>
            </div>
            )}

            {/* 🎛️ CONSOLA DE MEDIOS (Control de reproducción) */}
            {projectionSourceMode === 'preaching' && (
              <div className="min-h-0 flex-1 overflow-y-auto border-b border-emerald-500/20 bg-emerald-500/7 p-4 pr-5 [&::-webkit-scrollbar]:hidden">
                <div className="mb-3 flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-[0.24em] text-emerald-300">Predica en vivo</p>
                    <h2 className="truncate text-lg font-black text-white">{activePreaching?.title || evento?.predicaTitle || 'Sin predica asociada'}</h2>
                    <p className="mt-1 truncate text-xs font-bold text-zinc-400">
                      {preachingStatus
                        ? `${preachingStatus.pastorName || activePreaching?.preacherName || 'Pastor'} · ${preachingStatus.active ? 'Predicando' : 'Preparado'}`
                        : activePreaching?.preacherName || 'Sin sesion iniciada'}
                    </p>
                  </div>
                  {preachingStatus && (
                    <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase ${preachingStatus.active ? 'border-emerald-400/25 bg-emerald-500/10 text-emerald-200' : 'border-zinc-500/20 bg-white/5 text-zinc-400'}`}>
                      Punto {preachingStatus.currentStep || 0} de {preachingStatus.totalSteps || 0}
                    </span>
                  )}
                </div>

                {!activePreaching ? (
                  <p className="rounded-2xl border border-white/10 bg-black/25 p-4 text-sm font-bold text-zinc-500">Asocia una predica al evento para controlar versiculos y puntos desde aqui.</p>
                ) : (
                  <div className="grid gap-3 xl:grid-cols-[0.85fr_1.15fr]">
                    {preachingSelectionPanel}
                    <div className="rounded-2xl border border-blue-400/20 bg-blue-500/10 p-3">
                      <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-blue-200">Versiculos</p>
                      <div className="max-h-40 space-y-2 overflow-y-auto pr-1">
                        {publicVerses.length === 0 ? (
                          <p className="text-xs font-bold text-blue-100/60">No hay versiculos publicos preparados.</p>
                        ) : publicVerses.map((verse, index) => (
                          <div key={verse.id || index} className="flex items-center justify-between gap-2 rounded-xl bg-black/25 p-2">
                            <div className="min-w-0">
                              <p className="truncate text-xs font-black text-blue-50">{[verse.reference, verse.translation].filter(Boolean).join(' · ') || 'Referencia sin definir'}</p>
                              {verse.text && <p className="line-clamp-1 text-[10px] font-semibold text-blue-100/60">{verse.text}</p>}
                            </div>
                            <button type="button" onClick={() => selectPreachingBlock(verse.id)} className="shrink-0 rounded-lg bg-blue-600 px-2 py-1.5 text-[9px] font-black uppercase text-white hover:bg-blue-500">
                              Previsualizar
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                    {publicMediaInstructions.length > 0 && (
                      <div className="rounded-2xl border border-cyan-400/20 bg-cyan-500/10 p-3 xl:col-span-2">
                        <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-cyan-200">Indicaciones multimedia publicas</p>
                        <div className="flex gap-2 overflow-x-auto pb-1">
                          {publicMediaInstructions.map((item, index) => (
                            <span key={item.id || index} className="max-w-xs shrink-0 rounded-xl bg-black/25 px-3 py-2 text-[10px] font-bold text-cyan-50">
                              {item.instruction || 'Indicacion sin detalle'}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {projectionSourceMode === 'bible' && (
              <div className="min-h-0 flex-1 overflow-y-auto border-b border-blue-500/20 bg-blue-500/7 p-4 pr-5 [&::-webkit-scrollbar]:hidden">
                <div className="mb-3 flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-[0.24em] text-blue-300">Biblia Kadosh</p>
                    <h2 className="truncate text-lg font-black text-white">Preparar y proyectar pasajes</h2>
                    <p className="mt-1 text-xs font-bold text-zinc-400">El bosquejo es local al evento; solo proyectar cambia la pantalla publica.</p>
                  </div>
                  {lastBiblePassage && (
                    <span className="rounded-full border border-blue-400/25 bg-blue-500/10 px-3 py-1 text-[10px] font-black uppercase text-blue-100">
                      Ultimo: {lastBiblePassage.reference}
                    </span>
                  )}
                </div>
                {bibleOutlinePanel}
              </div>
            )}

            {projectionSourceMode === 'media' && mediaActive && mediaActive.type === 'video' && (
              <div className="bg-indigo-600/10 border-b border-indigo-500/30 p-4 flex items-center gap-4 animate-in slide-in-from-top-2 relative group/console">
                <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center shrink-0 shadow-lg shadow-indigo-500/20">
                  <Film size={24} className="text-white"/>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center mb-2">
                    <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest truncate max-w-[200px]">
                      {mediaActive.playing ? 'EN VIVO:' : 'PAUSADO:'} {mediaActive.name || 'Video'}
                    </p>
                    <button onClick={detenerMedia} className="p-1 text-zinc-500 hover:text-red-500 transition-colors" title="Cerrar Media">
                      <X size={16}/>
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    {/* Controles de Transporte */}
                    <div className="flex items-center gap-1 bg-zinc-950/60 p-1 rounded-xl border border-white/5 shadow-inner">
                      <button onClick={() => handleSeekCommand('start')} className="p-2 text-zinc-400 hover:text-white transition-colors" title="Reiniciar"><RotateCcw size={16}/></button>
                      <button onClick={() => handleSeekCommand('back10')} className="p-2 text-zinc-400 hover:text-white transition-colors" title="-10s"><Rewind size={16}/></button>
                      <button 
                        onClick={() => handleMediaControl({ playing: !mediaActive.playing })}
                        className="w-10 h-10 flex items-center justify-center bg-white text-zinc-950 rounded-lg hover:bg-indigo-50 transition-all active:scale-95 shadow-md"
                      >
                        {mediaActive.playing ? <Pause size={20} fill="currentColor"/> : <Play size={20} fill="currentColor" className="ml-0.5" />}
                      </button>
                      <button onClick={() => handleSeekCommand('fwd10')} className="p-2 text-zinc-400 hover:text-white transition-colors" title="+10s"><FastForward size={16}/></button>
                    </div>
                    
                    {/* Mezclador de Volumen Local */}
                    <div className="flex items-center gap-3 bg-zinc-950/60 px-4 py-2 rounded-xl border border-white/5 shadow-inner">
                      <Volume2 size={16} className={mediaActive.volume === 0 ? "text-zinc-600" : "text-indigo-400"} />
                      <input 
                        type="range" min="0" max="1" step="0.01" 
                        value={mediaActive.volume ?? 1} 
                        onChange={(e) => handleMediaControl({ volume: parseFloat(e.target.value) })}
                        className="w-24 h-1.5 bg-zinc-800 rounded-full appearance-none cursor-pointer accent-indigo-500"
                      />
                      <span className="text-[10px] font-mono font-black text-zinc-500 w-8 text-right">{Math.round((mediaActive.volume ?? 1) * 100)}%</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {projectionSourceMode === 'songs' && (
            <div className="min-h-0 flex-1 flex flex-col p-4 bg-zinc-950/25 overflow-hidden">
            {!activeSong ? (
              <div className="h-full flex items-center justify-center text-zinc-600 font-medium">Selecciona una cancion del setlist</div>
            ) : (
              <>
              <div className="flex gap-2 mb-4 shrink-0">
                <button 
                  onClick={() => projectSlide({ titulo: 'Instrumental', texto: ' ' })}
                  className="flex-1 py-3 bg-zinc-900/85 hover:bg-zinc-800 border border-white/10 rounded-2xl flex items-center justify-center gap-2 font-black text-zinc-300 transition-colors shadow-sm active:scale-95"
                >
                  <Eraser size={18} className="text-zinc-400"/> Limpiar Texto
                </button>
                <button 
                  onClick={toggleLogo}
                  className={`flex-1 py-3 rounded-2xl flex items-center justify-center gap-2 font-black transition-colors shadow-sm active:scale-95 ${isLogoActive ? 'bg-amber-600 border border-amber-500 text-white animate-pulse shadow-[0_0_15px_rgba(217,119,6,0.4)]' : 'bg-zinc-900/85 hover:bg-zinc-800 border border-white/10 text-zinc-300'}`}
                >
                  <Star size={18} className={isLogoActive ? "text-amber-100" : "text-amber-500"}/> {isLogoActive ? 'Quitar Logo' : 'Mostrar Logo'}
                </button>
              </div>
              
              <div className="min-h-0 flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden grid grid-cols-2 lg:grid-cols-3 gap-4 pb-20">
                {slides.map((s, idx) => (
                  <div 
                    key={s.titulo + idx} // Usar una key más robusta
                    onClick={() => setPreviewSlide(s)}
                    onDoubleClick={() => projectSlide(s)}
                    className={`relative cursor-pointer border rounded-2xl overflow-hidden flex flex-col h-36 transition-all transform active:scale-95 ${previewSlide?.texto === s.texto ? 'border-violet-400 ring-2 ring-violet-500/30' : 'border-white/10 hover:border-zinc-500'} ${liveSlide?.texto === s.texto && !isBlackout ? 'bg-violet-500/12 shadow-[0_0_28px_rgba(139,92,246,0.16)]' : 'bg-zinc-900/82'}`}
                  >
                    <div className="px-3 py-2 bg-zinc-950/80 border-b border-zinc-800 flex justify-between items-center shrink-0">
                      <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest truncate">
                        {s.titulo}{s.cues?.length ? ` - ${s.cues[0]}` : ''}
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {s.media?.length > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-violet-500/30 bg-violet-500/10 px-1.5 py-0.5 text-[8px] font-black text-violet-200" title="Multimedia de seccion">
                            <ImageIcon size={10} /> {s.media.length}
                          </span>
                        )}
                        {liveSlide?.texto === s.texto && !isBlackout && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shadow-[0_0_5px_rgba(239,68,68,0.8)]" title="En vivo"></span>}
                      </div>
                    </div>
                    <div className="p-3 flex-1 flex items-center justify-center text-center overflow-hidden">
                      <p className="text-xs sm:text-sm font-bold text-zinc-300 line-clamp-4 leading-relaxed">
                        {s.texto.trim() === '' ? <span className="text-zinc-600 italic">🎶 Instrumental</span> : s.texto}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              
              {/* Botón flotante para PC/Tablet de Siguiente */}
              <button onClick={projectNextSlide} className="absolute bottom-6 right-6 p-6 bg-orange-600 hover:bg-orange-500 text-white rounded-full shadow-2xl z-20 hover:scale-110 active:scale-95 transition-all flex items-center justify-center border-4 border-white/20">
                <ChevronRight size={40} />
              </button>
              </>
            )}
          </div>
            )}
          </div> 
        </div> 

        {/* Columna Derecha: Vista Previa y En Vivo */}
        <div className="w-1/3 min-w-[320px] min-h-0 bg-zinc-950/55 flex flex-col overflow-y-auto backdrop-blur-sm [&::-webkit-scrollbar]:hidden">
          {canReadPastorRequests && eventoId !== 'global' && (
            <div className="border-b border-white/10 bg-zinc-950/85 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-widest text-amber-300">Solicitudes del Pastor</p>
                  {preachingStatus ? (
                    <p className="truncate text-xs font-bold text-zinc-400">
                      {preachingStatus.pastorName || 'Pastor'} · Punto {preachingStatus.currentStep || 0} de {preachingStatus.totalSteps || 0}: {preachingStatus.currentTitle || ''}
                    </p>
                  ) : (
                    <p className="text-xs font-bold text-zinc-600">Sin progreso activo</p>
                  )}
                </div>
                <span className="shrink-0 rounded-full bg-amber-500/10 px-2 py-1 text-[10px] font-black text-amber-200">
                  {preacherRequests.filter(item => item.status === PREACHER_REQUEST_STATUS.PENDING).length}
                </span>
              </div>
              <div className="max-h-48 space-y-2 overflow-y-auto pr-1 [&::-webkit-scrollbar]:hidden">
                {preacherRequests.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-zinc-800 bg-zinc-900/50 p-3 text-center text-[11px] font-bold text-zinc-600">No hay solicitudes pendientes.</p>
                ) : preacherRequests.slice(0, 4).map(request => {
                  const pending = request.status === PREACHER_REQUEST_STATUS.PENDING;
                  const isQuickAlert = request.type === PREACHER_REQUEST_TYPES.QUICK_ALERT;
                  return (
                    <div key={request.id} className={`rounded-2xl border p-3 ${pending ? 'border-amber-500/25 bg-amber-500/10' : 'border-zinc-800 bg-zinc-900/65'}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-black text-white">{isQuickAlert ? request.message : (request.reference || request.title || 'Solicitud')}</p>
                          <p className="text-[10px] font-bold uppercase text-zinc-500">{request.translation || request.type} · {request.status}</p>
                        </div>
                      </div>
                      {!isQuickAlert && <p className="mt-2 line-clamp-2 text-[11px] font-semibold text-zinc-300">{request.text || (request.type === PREACHER_REQUEST_TYPES.VERSE ? 'Texto no guardado.' : request.title)}</p>}
                      {pending && canHandlePastorRequests && !isQuickAlert && (
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <button onClick={() => projectPreacherRequest(request)} disabled={handlingPreacherRequestId === request.id} className="rounded-xl bg-violet-600 px-2 py-2 text-[9px] font-black uppercase text-white disabled:opacity-50">Proyectar</button>
                          <button onClick={() => ignorePreacherRequest(request)} disabled={handlingPreacherRequestId === request.id} className="rounded-xl bg-zinc-800 px-2 py-2 text-[9px] font-black uppercase text-zinc-300 disabled:opacity-50">Ignorar</button>
                        </div>
                      )}
                      {pending && canHandlePastorRequests && isQuickAlert && (
                        <button onClick={() => ignorePreacherRequest(request)} disabled={handlingPreacherRequestId === request.id} className="mt-2 w-full rounded-xl bg-zinc-800 px-2 py-2 text-[9px] font-black uppercase text-zinc-300 disabled:opacity-50">Marcar visto</button>
                      )}
                    </div>
                  );
                })}
              </div>
              {canHandlePastorRequests && (
                <div className="mt-2 flex gap-2 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden">
                  {MULTIMEDIA_TO_PASTOR_PRESETS.map(message => (
                    <button key={message} onClick={() => sendPastorPreset(message)} className="shrink-0 rounded-xl border border-cyan-500/20 bg-cyan-500/10 px-3 py-2 text-[9px] font-black uppercase text-cyan-100">
                      {message}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Pre-visualización */}
          <div className="min-h-[260px] border-b border-white/10 flex flex-col">
            <div className="p-3 border-b border-white/10 bg-zinc-950/70">
              <h2 className="font-bold text-sm flex items-center gap-2 text-zinc-400"><Eye size={16}/> Pre-proyección</h2>
            </div>
            <div className="min-h-0 flex-1 p-5 flex flex-col">
              <div className="flex-1 bg-black rounded-3xl border border-white/10 shadow-[inset_0_0_60px_rgba(255,255,255,0.03),0_18px_45px_rgba(0,0,0,0.28)] flex items-center justify-center p-6 text-center overflow-hidden relative">
                {projectionSourceMode === 'media' && previewMedia ? (
                  <>
                    {previewMedia.type === 'video' ? (
                      <video src={previewMedia.url} controls muted playsInline className="absolute inset-0 z-0 w-full h-full object-contain bg-zinc-900" />
                    ) : (
                      <img src={previewMedia.url} className="absolute inset-0 z-0 w-full h-full object-contain bg-zinc-900" />
                    )}
                    <button onClick={() => setPreviewMedia(null)} className="absolute top-4 right-4 p-2 bg-red-600/80 hover:bg-red-600 rounded-full text-white shadow-xl z-20 transition-all"><X size={18}/></button>
                  </>
                ) : projectionSourceMode === 'songs' && previewSlide ? (
                  <>
                    {previewBackground && isVideoMediaUrl(previewBackground) ? (
                      <video src={previewBackground} autoPlay loop muted playsInline className="absolute inset-0 w-full h-full object-cover opacity-40 z-0 pointer-events-none" />
                    ) : previewBackground && (
                      <img src={previewBackground} className="absolute inset-0 w-full h-full object-cover opacity-40 z-0 pointer-events-none" />
                    )}
                    {previewSlide.texto.trim() === '' ? (
                      <span className="relative z-10 text-white/30 italic font-medium">Instrumental</span>
                    ) : (
                      <AutoFitText
                        text={previewSlide.texto}
                        minFontSize={10}
                        maxFontSize={24}
                        safeMaxWidth="92%"
                        safeMaxHeight="82%"
                        variant="preview"
                        debounceMs={80}
                        className="font-black text-white drop-shadow-lg"
                      />
                    )}
                  </>
                ) : projectionSourceMode === 'bible' && biblePreview?.slides?.[biblePreview.selectedIndex] ? (
                  <>
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.22),transparent_55%)]" />
                    <div className="relative z-10 flex h-full w-full flex-col items-center justify-center gap-3">
                      <p className="text-[10px] font-black uppercase tracking-widest text-blue-200">{biblePreview.slides[biblePreview.selectedIndex].reference}</p>
                      {biblePreview.slides[biblePreview.selectedIndex].heading && <p className="text-xs font-black uppercase tracking-wide text-blue-100">{biblePreview.slides[biblePreview.selectedIndex].heading}</p>}
                      <AutoFitText text={biblePreview.slides[biblePreview.selectedIndex].text} minFontSize={10} maxFontSize={24} safeMaxWidth="92%" safeMaxHeight="72%" variant="preview" debounceMs={80} className="font-black text-white drop-shadow-lg" />
                      <p className="text-[10px] font-bold text-blue-100/70">{biblePreview.selectedIndex + 1} / {biblePreview.slides.length} · {biblePreview.passage?.abbreviation || 'RVR1960'}</p>
                    </div>
                  </>
                ) : projectionSourceMode === 'preaching' ? (
                  <div className="relative z-10 flex h-full w-full flex-col items-center justify-center gap-3 text-center">
                    <ShieldCheck size={28} className="text-emerald-300" />
                    <p className="text-xs font-black uppercase tracking-widest text-emerald-200">Prédica preparada</p>
                    <p className="max-w-xs text-[11px] font-bold leading-relaxed text-zinc-500">Selecciona un punto o versículo en el panel de prédica para previsualizarlo y proyectarlo.</p>
                  </div>
                ) : (
                  <p className="text-zinc-700 font-bold uppercase tracking-widest text-xs">Sin Selección</p>
                )}
              </div>
              {projectionSourceMode === 'songs' && previewSlide?.media?.length > 0 && (
                <div className="mt-3 rounded-2xl border border-violet-500/20 bg-violet-500/10 p-3">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-violet-200">
                      <ImageIcon size={14} /> Multimedia ({previewSlide.media.length})
                    </p>
                    <span className="text-[9px] font-bold uppercase tracking-widest text-emerald-300 truncate">Principal automatica</span>
                  </div>
                  <div className="space-y-2 max-h-36 overflow-y-auto pr-1 [&::-webkit-scrollbar]:hidden">
                    {previewSlide.media.map((resource, index) => (
                      <div key={resource.id || `${resource.url}-${index}`} className="flex items-center gap-2 rounded-xl border border-white/10 bg-zinc-950/70 px-2.5 py-2">
                        <div className="shrink-0">{getMediaIcon(resource.type)}</div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-bold text-white">{resource.title || resource.name || `Recurso ${index + 1}`}</p>
                          <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{resource.type || 'media'}{resource.source ? ` - ${resource.source}` : ''}</p>
                        </div>
                        {index === 0 ? (
                          <span className="shrink-0 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1.5 text-[9px] font-black uppercase tracking-wide text-emerald-200">
                            Auto
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => projectSectionMedia(resource)}
                            className="shrink-0 rounded-lg bg-violet-600 px-2.5 py-1.5 text-[9px] font-black uppercase tracking-wide text-white hover:bg-violet-500 active:scale-95"
                          >
                            Proyectar
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {projectionSourceMode === 'songs' && (
                <button
                  onClick={() => projectSlide(previewSlide)}
                  disabled={!previewSlide}
                  className="mt-4 py-3.5 bg-violet-600 hover:bg-violet-500 text-white rounded-2xl font-black text-sm uppercase tracking-wide flex items-center justify-center gap-2 disabled:opacity-40 disabled:grayscale transition-all active:scale-95 shadow-lg shadow-violet-900/20"
                >
                  <Monitor size={18} /> Proyectar Diapositiva
                </button>
              )}
              {projectionSourceMode === 'media' && (
                <button
                  onClick={() => projectMedia(previewMedia)}
                  disabled={!previewMedia}
                  className="mt-4 py-3.5 bg-violet-600 hover:bg-violet-500 text-white rounded-2xl font-black text-sm uppercase tracking-wide flex items-center justify-center gap-2 disabled:opacity-40 disabled:grayscale transition-all active:scale-95 shadow-lg shadow-violet-900/20"
                >
                  <Monitor size={18} /> Proyectar Contenido
                </button>
              )}
              {projectionSourceMode === 'bible' && (
                <>
                  <button
                    onClick={() => projectBiblePassage({ ...biblePreview, outlineItemId: biblePreviewOutlineItemId })}
                    disabled={!biblePreview}
                    className="mt-4 py-3.5 bg-violet-600 hover:bg-violet-500 text-white rounded-2xl font-black text-sm uppercase tracking-wide flex items-center justify-center gap-2 disabled:opacity-40 disabled:grayscale transition-all active:scale-95 shadow-lg shadow-violet-900/20"
                  >
                    <Monitor size={18} /> Proyectar Biblia
                  </button>
                  {evento?.projectorState?.contentType === 'bible' && Array.isArray(evento?.projectorState?.bible?.slides) && (
                    <div className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-blue-400/20 bg-blue-500/10 p-2">
                      <button type="button" onClick={() => projectBibleDeckSlide(-1)} disabled={!Number(evento.projectorState.bible?.slideIndex)} className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-[10px] font-black uppercase text-blue-100 disabled:opacity-30"><ChevronLeft size={15} /> Anterior</button>
                      <span className="text-[10px] font-black text-blue-100">{Number(evento.projectorState.bible?.slideIndex || 0) + 1} / {evento.projectorState.bible.slides.length}</span>
                      <button type="button" onClick={() => projectBibleDeckSlide(1)} disabled={Number(evento.projectorState.bible?.slideIndex || 0) >= evento.projectorState.bible.slides.length - 1} className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-[10px] font-black uppercase text-blue-100 disabled:opacity-30">Siguiente <ChevronRight size={15} /></button>
                    </div>
                  )}
                </>
              )}
              {projectionSourceMode === 'preaching' && currentPublicPoint && (
                <button
                  onClick={() => projectPreachingBlockFromController(currentPublicPoint)}
                  className="mt-4 py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-black text-sm uppercase tracking-wide flex items-center justify-center gap-2 transition-all active:scale-95 shadow-lg shadow-emerald-950/20"
                >
                  <Monitor size={18} /> Proyectar Punto
                </button>
              )}
            </div>
          </div>

          {/* En Vivo */}
          <div className="min-h-[260px] flex flex-col">
            <div className="p-3 border-b border-white/10 bg-zinc-950/70 flex justify-between items-center">
              <h2 className="font-bold text-sm flex items-center gap-2 text-red-500"><Play size={16}/> En Vivo</h2>
              
              {/* Tiempo CONTROL DE RELOJ (Countdown) SIEMPRE VISIBLE */}
              <div className="flex items-center gap-2 bg-zinc-950/90 p-1 rounded-xl border border-white/10 scale-90">
                <input type="number" value={countdownMinutes} onChange={e => setCountdownMinutes(parseInt(e.target.value))} className="w-8 bg-transparent text-center font-bold text-xs outline-none text-violet-400" />
                <button onClick={() => toggleCountdown(!(evento?.proyectorCountdown?.active))} className={`px-2 py-1 rounded text-[8px] font-black uppercase transition-all ${evento?.proyectorCountdown?.active ? 'bg-red-600 text-white' : 'bg-zinc-800 text-zinc-500 hover:text-white'}`}>
                  {evento?.proyectorCountdown?.active ? 'PARAR' : 'RELOJ'}
                </button>
              </div>

              {isBlackout && <span className="text-[10px] bg-red-600 px-2 py-0.5 rounded-full font-bold uppercase tracking-widest">Apagado</span>}
            </div>
            <div className="min-h-0 flex-1 p-5">
              <div className={`relative w-full h-full rounded-3xl border shadow-[inset_0_0_60px_rgba(255,255,255,0.03),0_18px_45px_rgba(0,0,0,0.28)] flex flex-col p-6 overflow-hidden transition-colors ${isBlackout ? 'border-red-900/50 bg-black items-center justify-center' : modoTransmision ? 'border-emerald-500 bg-[#00FF00] items-start justify-end pb-8' : 'border-red-500/70 bg-black items-center justify-center text-center'}`}>
                {countdownTimeLeft && (
                  <div className="absolute top-3 right-3 z-30 px-3 py-1.5 rounded-xl bg-emerald-500/95 text-white shadow-lg border border-white/20">
                    <p className="text-[8px] font-black uppercase tracking-widest leading-none mb-0.5">Cronómetro</p>
                    <p className="font-mono text-lg font-black leading-none">{countdownTimeLeft}</p>
                  </div>
                )}
                {isBlackout ? (
                   <p className="relative z-10 text-red-900/50 font-black uppercase tracking-widest">Pantalla en Negro</p>
                ) : evento?.projectorState?.contentType === 'bible' ? (
                  <div className="relative z-10 flex h-full w-full flex-col items-center justify-center gap-3 text-center">
                    <p className="text-[10px] font-black uppercase tracking-widest text-amber-200">{evento.projectorState.reference}</p>
                    <AutoFitText text={evento.projectorState.content || ''} minFontSize={10} maxFontSize={24} safeMaxWidth="92%" safeMaxHeight="72%" variant="preview" debounceMs={80} className="font-black text-white drop-shadow-lg" />
                    <p className="text-[10px] font-bold text-zinc-400">{Number(evento.projectorState.bibleSlideIndex || 0) + 1} / {evento.projectorState.bibleSlideCount || 1} · {evento.projectorState.translation || 'RVR1960'}</p>
                  </div>
                ) : displayLiveSlide ? (
                  <> {/* LETRAS EN VIVO */}
                    {!modoTransmision && fondoActivo && isVideoMediaUrl(fondoActivo) ? (
                      <video src={fondoActivo} autoPlay loop muted playsInline className="absolute inset-0 w-full h-full object-cover opacity-40 z-0 pointer-events-none" />
                    ) : !modoTransmision && fondoActivo && (
                      <img src={fondoActivo} className="absolute inset-0 w-full h-full object-cover opacity-40 z-0 pointer-events-none" />
                    )}
                    {displayLiveSlide.texto.trim() === '' ? (
                      <span className="relative z-10 text-white/30 italic font-medium">Instrumental</span>
                    ) : modoTransmision ? (
                      <p className={`relative z-10 font-black text-white whitespace-pre-wrap ${animationClass} text-[0.5rem] text-left bg-black/80 border-l-[4px] border-violet-600 py-2 pr-3 pl-2 rounded-r-lg shadow-xl max-w-[90%]`}>
                        {displayLiveSlide.texto}
                      </p>
                    ) : (
                      <AutoFitText
                        text={displayLiveSlide.texto}
                        minFontSize={10}
                        maxFontSize={24}
                        safeMaxWidth="92%"
                        safeMaxHeight="82%"
                        variant="preview"
                        debounceMs={80}
                        className="font-black text-white drop-shadow-lg"
                      />
                    )}
                  </>
                ) : mediaActive?.url ? ( // MULTIMEDIA EN VIVO
                  <div className="flex flex-col items-center gap-3 animate-in fade-in zoom-in-95 duration-300">
                    <div className="absolute inset-0 z-0 opacity-40">
                       {mediaActive.type === 'video' ? <video src={mediaActive.url} autoPlay loop muted playsInline className="w-full h-full object-contain" /> : <img src={mediaActive.url} className="w-full h-full object-contain" />}
                    </div>
                    <div className="relative z-10 text-center px-4 flex flex-col items-center justify-center h-full">
                      <p className="text-indigo-400 font-black text-[11px] uppercase tracking-[0.2em] mb-1">
                        {mediaActive.type === 'video' ? 'Proyectando Video' : 'Proyectando Imagen'}
                      </p>
                      <p className="text-white text-xs font-bold truncate max-w-[200px] mb-6 italic bg-black/50 px-3 py-1 rounded-full">"{mediaActive.name || 'Archivo'}"</p>
                      <button 
                        onClick={detenerMedia} 
                        className="px-8 py-3 bg-red-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-2xl hover:bg-red-500 transition-all active:scale-95 border border-white/10"
                      >
                        Quitar Multimedia
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <div className="relative z-10 w-12 h-12 bg-gradient-to-br from-blue-600 to-violet-600 rounded-xl flex items-center justify-center transform -rotate-6 opacity-50">
                      <Monitor className="text-white w-6 h-6 transform rotate-6" />
                    </div>
                    <p className="text-zinc-700 font-bold uppercase tracking-widest text-xs">Kadosh App</p>
                  </div>
                )}
              </div>
            </div>
          </div>
           {/* PANEL MEJORADO: Avisos a Tarima y Congregación */}
          <div className="border-t border-white/10 bg-zinc-950/80 p-4 shrink-0 flex flex-col gap-3 shadow-[0_-10px_30px_rgba(0,0,0,0.35)] z-10 relative backdrop-blur-sm">
            
            {/* Pantalla privada del Predicador */}
            <div className="rounded-3xl border border-amber-500/25 bg-amber-500/7 p-3 flex flex-col gap-3 shadow-[0_12px_30px_rgba(0,0,0,0.18)]">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-bold text-xs flex items-center gap-1.5 text-amber-300 uppercase tracking-widest"><ShieldCheck size={14}/> Canal Pastor</h2>
                  <p className="text-[10px] text-amber-100/70 font-bold mt-1">Canal privado con el Pastor. Nunca se muestra a la congregacion.</p>
                  <p className="mt-1 text-[10px] font-bold text-zinc-400">
                    {preacherLastUpdated ? `Última actualización: ${new Date(preacherLastUpdated).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}` : 'No hay mensaje activo para el Pastor.'}
                  </p>
                </div>
                <button
                  onClick={() => setIsPreacherPanelOpen(prev => !prev)}
                  className="shrink-0 rounded-lg border border-amber-500/30 px-2 py-1 text-[10px] font-black uppercase text-amber-200 hover:bg-amber-500/10"
                >
                  {isPreacherPanelOpen ? 'Contraer' : 'Expandir'}
                </button>
              </div>

              {preacherSendStatus && (
                <div className={`rounded-xl px-3 py-2 text-[11px] font-black uppercase tracking-widest border ${preacherSendStatus.includes('No se') ? 'bg-red-500/10 border-red-500/30 text-red-200' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'}`}>
                  {preacherSendStatus}
                </div>
              )}

              {!isPreacherPanelOpen && (
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={sendToPreacher} className="rounded-xl bg-amber-600 px-2 py-2 text-[10px] font-black uppercase tracking-wide text-white hover:bg-amber-500">Enviar rápido</button>
                  <button onClick={() => setIsPreacherPanelOpen(true)} className="rounded-xl bg-zinc-800 px-2 py-2 text-[10px] font-black uppercase tracking-wide text-zinc-300 hover:bg-zinc-700">Campos</button>
                </div>
              )}

              {isPreacherPanelOpen && (
                <>
                  <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/20 bg-zinc-950/70 px-3 py-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-amber-200">Canal privado con el Pastor</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input value={preacherDraft.tema} onChange={e => updatePreacherDraft('tema', e.target.value)} placeholder="Tema" className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-amber-500" />
                    <input value={preacherDraft.tiempoRestante} onChange={e => updatePreacherDraft('tiempoRestante', e.target.value)} placeholder="Tiempo restante (ej. 20:00)" className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-amber-500" />
                    <input value={preacherDraft.puntoActual} onChange={e => updatePreacherDraft('puntoActual', e.target.value)} placeholder="Punto actual" className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-amber-500" />
                    <input value={preacherDraft.siguientePunto} onChange={e => updatePreacherDraft('siguientePunto', e.target.value)} placeholder="Siguiente punto" className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-amber-500" />
                  </div>
                  <textarea value={preacherDraft.versiculoActual} onChange={e => updatePreacherDraft('versiculoActual', e.target.value)} placeholder="Versículo actual" rows={2} className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-blue-500 resize-none" />
                  <textarea value={preacherDraft.notasPrivadas} onChange={e => updatePreacherDraft('notasPrivadas', e.target.value)} placeholder="Notas privadas del Pastor (no salen al proyector)" rows={2} className="bg-zinc-950 border border-amber-500/20 rounded-lg px-3 py-2 text-xs text-amber-50 outline-none focus:border-amber-500 resize-none" />
                  <div className="grid grid-cols-2 gap-2">
                    <input value={preacherDraft.mensajesInternos} onChange={e => updatePreacherDraft('mensajesInternos', e.target.value)} placeholder="Mensaje privado al Pastor" className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-cyan-500" />
                    <input value={preacherDraft.indicaciones} onChange={e => updatePreacherDraft('indicaciones', e.target.value)} placeholder="Indicación: oración, llamado..." className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-red-500" />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={sendToPreacher} className="flex-1 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2"><MessageSquare size={14}/> Enviar al Pastor</button>
                    <button onClick={clearPreacherDisplay} className="px-3 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[10px] font-black uppercase flex items-center gap-1"><X size={14}/> Limpiar Canal</button>
                  </div>
                </>
              )}
            </div>

            {/* Retorno a Tarima */}
            <div className="flex flex-col gap-2 rounded-3xl border border-white/10 bg-zinc-900/45 p-3">
              <div className="flex items-center">
                 <h2 className="font-bold text-xs flex items-center gap-1.5 text-amber-500 uppercase tracking-widest"><AlertCircle size={14}/> Retorno a Tarima</h2>
              </div>
              <div className="grid grid-cols-3 gap-1 rounded-xl bg-zinc-950/70 p-1 border border-zinc-800">
                {[
                  ['cantantes', 'Cantantes'],
                  ['musicos', 'Musicos'],
                  ['all', 'Todos']
                ].map(([target, label]) => (
                  <button
                    key={target}
                    onClick={() => setAlertaTarget(target)}
                    className={`rounded-lg px-2 py-1.5 text-[9px] font-black uppercase transition-colors ${alertaTarget === target ? 'bg-blue-600 text-white' : 'text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-1 rounded-xl bg-zinc-950/70 p-1 border border-zinc-800">
                {['normal', 'importante', 'urgente'].map(level => (
                  <button
                    key={level}
                    onClick={() => setAlertaPriority(level)}
                    className={`rounded-lg px-2 py-1.5 text-[9px] font-black uppercase transition-colors ${alertaPriority === level ? (level === 'urgente' ? 'bg-red-600 text-white' : level === 'importante' ? 'bg-amber-500 text-zinc-950' : 'bg-emerald-600 text-white') : 'text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200'}`}
                  >
                    {level}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input type="text" value={alertaTarima} onChange={e => setAlertaTarima(e.target.value)} placeholder="Solo musicos..." className="flex-1 bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:border-amber-500 outline-none text-white placeholder:text-zinc-600 transition-all" onKeyPress={e => e.key === 'Enter' && enviarAlerta()} />
                <button onClick={enviarAlerta} disabled={isSendingAlert || !alertaTarima.trim()} className="bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white px-3 py-2 rounded-lg font-bold transition-all"><Send size={16}/></button>
              </div>
              {evento?.proyectorAlerta && (
                <div className="flex items-center justify-between bg-amber-500/10 border border-amber-500/30 p-2 rounded-lg">
                  <span className="text-[10px] text-amber-100 font-bold truncate">
                    {typeof evento.proyectorAlerta === 'string' ? `Mensaje activo: ${evento.proyectorAlerta}` : `Mensaje activo para ${evento.proyectorAlerta.target === 'all' ? 'Todos' : evento.proyectorAlerta.target === 'cantantes' ? 'Cantantes' : 'Musicos'}: ${evento.proyectorAlerta.text || ''}`}
                  </span>
                  <button onClick={limpiarAlerta} className="text-white hover:bg-red-500 text-[10px] font-bold uppercase bg-red-600 px-2 py-1 rounded transition-colors shrink-0">Ocultar</button>
                </div>
              )}
              {!evento?.proyectorAlerta && (
                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">Sin mensaje activo</p>
              )}
            </div>
            
            {/* Marquesina Pública */}
            <div className="flex flex-col gap-2 rounded-3xl border border-blue-500/20 bg-blue-500/6 p-3">
              <h2 className="font-bold text-xs flex items-center gap-1.5 text-blue-400 uppercase tracking-widest"><Megaphone size={14}/> Anuncio Congregación</h2>
              <div className="flex gap-2">
                <input type="text" value={tickerMsg} onChange={e => setTickerMsg(e.target.value)} placeholder="Pasará por la pantalla..." className="flex-1 bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:border-blue-500 outline-none text-white placeholder:text-zinc-600 transition-all" onKeyPress={e => e.key === 'Enter' && enviarTicker()} />
                <button onClick={enviarTicker} disabled={isSendingTicker || !tickerMsg.trim()} className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-3 py-2 rounded-lg font-bold transition-all"><Send size={16}/></button>
              </div>
              {evento?.proyectorTicker && (
                <div className="flex items-center justify-between bg-blue-600/20 border border-blue-500 p-2 rounded-lg">
                  <span className="text-[10px] text-blue-100 font-bold truncate">Pasando: {evento.proyectorTicker}</span>
                  <button onClick={limpiarTicker} className="text-white hover:bg-blue-500 text-[10px] font-bold uppercase bg-blue-600 px-2 py-1 rounded transition-colors shrink-0">Ocultar</button>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* VISTA MÓVIL (App Remota de 1 Toque - Se oculta en PC) */}
      <div className="relative z-10 md:hidden flex-1 flex flex-col bg-zinc-950/80 overflow-hidden [@media_(orientation:landscape)_and_(max-height:500px)]:flex">
        {projectionSourceMode === 'songs' && (
          <>
        {/* Barra de Setlist Horizontal */}
        <div className="bg-zinc-950/80 border-b border-white/10 p-3 overflow-x-auto whitespace-nowrap flex gap-2 shrink-0 [&::-webkit-scrollbar]:hidden backdrop-blur-sm">
          {(() => {
            const setlistItems = getEventSetlistItems(evento);
            return setlistItems.filter(i => i.type === 'song').map((item, idx) => {
              const c = canciones.find(c => c.id === item.value);
              if (!c) return null;
              return (
                <div key={item.idLocal || `${c.id}-${idx}`} className={`inline-flex items-center rounded-2xl border shadow-sm ${activeSongId === c.id ? 'bg-violet-600 text-white border-violet-500' : 'bg-zinc-900 text-zinc-400 border-white/10'}`}>
                  <button 
                    onClick={() => handleSelectSong(c)}
                    className="px-4 py-2 text-sm font-black"
                  >
                    {idx + 1}. {c.titulo}
                  </button>
                  {isTemporarySetlistItem(item) && (
                    <button
                      type="button"
                      onClick={(e) => quitarCancionAgregada(item, e)}
                      className="mr-1 rounded-xl bg-red-500/20 px-2 py-1 text-[9px] font-black uppercase text-red-100"
                      title="Quitar cancion agregada"
                    >
                      X
                    </button>
                  )}
                </div>
              );
            });
          })()}
        </div>

        {/* Grid de Diapositivas (1 solo toque proyecta) */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 pb-40">
          {!activeSong ? (
            <div className="h-full flex items-center justify-center text-zinc-600 font-medium text-sm text-center px-4">Desliza la barra superior y selecciona una cancion para proyectar</div>
          ) : (
            <>
              <div className="sticky top-0 z-20 flex gap-2 bg-zinc-950/90 backdrop-blur-sm pb-3 pt-1 -mx-4 px-4">
                <button onClick={() => projectSlide({ titulo: 'Instrumental', texto: ' ' })} className="flex-1 py-3.5 bg-zinc-800/80 hover:bg-zinc-700 border border-zinc-700 rounded-xl flex items-center justify-center gap-2 font-bold text-zinc-300 transition-colors shadow-sm active:scale-95">
                  <Eraser size={16} className="text-zinc-400"/> Limpiar
                </button>
                <button 
                  onClick={projectNextSlide} 
                  className="flex-[2] py-3.5 bg-orange-600 text-white border border-orange-500 rounded-xl flex items-center justify-center gap-2 font-black text-sm uppercase shadow-lg shadow-orange-900/20 active:scale-95 transition-all"
                >
                  Siguiente <ChevronRight size={20}/>
                </button>
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                {slides.map((s, idx) => (
                  <div 
                    key={idx}
                    onClick={() => projectSlide(s)}
                    className={`relative cursor-pointer border rounded-2xl overflow-hidden flex flex-col h-32 transition-all transform active:scale-95 
                      ${evento?.proyectorSlideIndex === idx && !isBlackout ? 'border-violet-500 ring-2 ring-violet-500/50 bg-zinc-800 shadow-[0_0_15px_rgba(139,92,246,0.15)]' : 'border-zinc-800 bg-zinc-900'}
                      ${evento?.proyectorSlideIndex !== undefined && evento.proyectorSlideIndex + 1 === idx ? 'border-orange-500/60 border-2 dashed' : ''}`}
                  >
                    <div className="px-2 py-1.5 bg-zinc-950/80 border-b border-zinc-800 flex justify-between items-center shrink-0">
                      <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest truncate">{s.titulo}{s.cues?.length ? ` - ${s.cues[0]}` : ''}</span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {s.media?.length > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/15 px-1.5 py-0.5 text-[8px] font-black text-violet-200">
                            <ImageIcon size={9} /> {s.media.length}
                          </span>
                        )}
                        {liveSlide?.texto === s.texto && !isBlackout && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shadow-[0_0_5px_rgba(239,68,68,0.8)]"></span>}
                      </div>
                    </div>
                    <div className="p-2 flex-1 flex items-center justify-center text-center overflow-hidden">
                      <p className="text-[10px] sm:text-xs font-bold text-zinc-300 line-clamp-4 leading-snug">
                        {s.texto.trim() === '' ? <span className="text-zinc-600 italic">🎶 Instrumental</span> : s.texto}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
          </>
        )}

        {projectionSourceMode === 'preaching' && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-40">
            <div className="rounded-3xl border border-emerald-500/20 bg-emerald-500/10 p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-emerald-300">Predica en vivo</p>
              <h2 className="mt-1 text-xl font-black text-white">{activePreaching?.title || evento?.predicaTitle || 'Sin predica asociada'}</h2>
              <p className="mt-1 text-xs font-bold text-zinc-400">
                {preachingStatus
                  ? `${preachingStatus.pastorName || activePreaching?.preacherName || 'Pastor'} - ${preachingStatus.active ? 'Predicando' : 'Preparado'}`
                  : activePreaching?.preacherName || 'Sin sesion iniciada'}
              </p>
              {preachingStatus && (
                <span className={`mt-3 inline-flex rounded-full border px-3 py-1 text-[10px] font-black uppercase ${preachingStatus.active ? 'border-emerald-400/25 bg-emerald-500/10 text-emerald-200' : 'border-zinc-500/20 bg-white/5 text-zinc-400'}`}>
                  Punto {preachingStatus.currentStep || 0} de {preachingStatus.totalSteps || 0}
                </span>
              )}
            </div>

            {!activePreaching ? (
              <p className="rounded-2xl border border-white/10 bg-black/25 p-4 text-sm font-bold text-zinc-500">Asocia una predica al evento para controlar versiculos y puntos desde aqui.</p>
            ) : (
              <>
                {preachingSelectionPanel}
                <div className="rounded-2xl border border-blue-400/20 bg-blue-500/10 p-4">
                  <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-blue-200">Versiculos publicos</p>
                  <div className="space-y-2">
                    {publicVerses.length === 0 ? (
                      <p className="text-xs font-bold text-blue-100/60">No hay versiculos publicos preparados.</p>
                    ) : publicVerses.map((verse, index) => (
                      <div key={verse.id || index} className="rounded-xl bg-black/25 p-3">
                        <p className="text-xs font-black text-blue-50">{[verse.reference, verse.translation].filter(Boolean).join(' - ') || 'Referencia sin definir'}</p>
                        {verse.text && <p className="mt-1 line-clamp-2 text-[10px] font-semibold text-blue-100/60">{verse.text}</p>}
                        <button type="button" onClick={() => selectPreachingBlock(verse.id)} className="mt-2 w-full rounded-lg bg-blue-600 px-2 py-2 text-[9px] font-black uppercase text-white hover:bg-blue-500">
                          Previsualizar
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {projectionSourceMode === 'bible' && (
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 pb-[calc(env(safe-area-inset-bottom)+11rem)] scroll-pb-[calc(env(safe-area-inset-bottom)+11rem)]">
            {bibleOutlinePanel}
          </div>
        )}

        {projectionSourceMode === 'media' && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-40">
            <div className="rounded-3xl border border-indigo-500/20 bg-indigo-500/10 p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-indigo-300">Multimedia</p>
              <h2 className="mt-1 text-xl font-black text-white">Boveda de medios</h2>
              <p className="mt-1 text-xs font-bold text-zinc-400">Selecciona un recurso para previsualizarlo y proyectarlo.</p>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={14} />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Buscar en boveda..."
                className="w-full rounded-2xl border border-white/10 bg-zinc-950/80 py-3 pl-9 pr-4 text-sm outline-none transition-all focus:border-indigo-500"
              />
            </div>
            {currentFolder && (
              <button onClick={() => setCurrentFolder(null)} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs font-black uppercase text-zinc-300">
                Volver a carpetas
              </button>
            )}
            {!currentFolder && multimediaFolders.length > 0 && (
              <div className="grid grid-cols-2 gap-3">
                {multimediaFolders.filter(f => f.toLowerCase().includes(searchTerm.toLowerCase())).map((folder, i) => (
                  <button key={`mobile-folder-${i}`} onClick={() => setCurrentFolder(folder)} className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-left">
                    <Folder size={24} className="mb-2 text-amber-400" />
                    <p className="truncate text-xs font-black text-amber-100">{folder}</p>
                  </button>
                ))}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              {filteredMedia.map((m, i) => (
                <button
                  key={`mobile-media-${m.url || i}`}
                  type="button"
                  onClick={() => setPreviewMedia({ url: m.url, type: m.type, mode: 'foreground', name: m.name })}
                  className={`overflow-hidden rounded-2xl border bg-black text-left ${previewMedia?.url === m.url ? 'border-indigo-400 ring-2 ring-indigo-500/30' : 'border-white/10'}`}
                >
                  <div className="aspect-video bg-zinc-900">
                    {m.type === 'video' ? <video src={m.url} className="h-full w-full object-cover opacity-70" /> : <img src={m.url} className="h-full w-full object-cover opacity-70" />}
                  </div>
                  <div className="p-2">
                    <p className="truncate text-[10px] font-black text-white">{m.name || 'Sin nombre'}</p>
                    <p className="text-[9px] font-bold uppercase text-zinc-500">{m.type || 'media'}</p>
                  </div>
                </button>
              ))}
            </div>
            {filteredMedia.length === 0 && (
              <p className="rounded-2xl border border-white/10 bg-black/25 p-4 text-center text-xs font-bold text-zinc-500">No hay medios para mostrar.</p>
            )}
            {previewMedia && (
              <button onClick={() => projectMedia(previewMedia)} className="w-full rounded-2xl bg-violet-600 py-3 text-xs font-black uppercase text-white shadow-lg shadow-violet-950/30">
                Proyectar multimedia
              </button>
            )}
          </div>
        )}

        {/* Barra Flotante Inferior de Estado (Móvil) */}
        <div className="absolute bottom-0 left-0 w-full bg-zinc-950/95 border-t border-white/10 p-4 flex items-center gap-3 z-20 pb-[calc(env(safe-area-inset-bottom)+1rem)] shadow-[0_-10px_30px_rgba(0,0,0,0.5)] backdrop-blur-md">
           <div className={`w-3 h-3 rounded-full shrink-0 ${isBlackout ? 'bg-zinc-600' : 'bg-red-500 animate-pulse'}`}></div>
           <div className="flex-1 truncate">
             <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mb-0.5">En Pantalla</p>
             <p className="text-xs font-bold text-white truncate">
               {isBlackout ? 'Pantalla en negro (Apagada)' : (liveSlide?.texto?.trim() ? liveSlide.texto.replace(/\n/g, ' - ') : '🎶 Instrumental (Solo fondo)')}
             </p>
           </div>
           <button
             onClick={() => setShowMobileControlsModal(true)}
             className="shrink-0 rounded-2xl border border-violet-500/30 bg-violet-600 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-white shadow-lg shadow-violet-950/30 active:scale-95"
           >
             Controles
           </button>
        </div>
      </div>

      {/* 📱 MODAL: PANEL DE CONTROL MÓVIL */}
      {showMobileControlsModal && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-xl flex flex-col z-[200] p-3 sm:p-4 animate-in fade-in duration-300">
          <div className="bg-zinc-950/96 border border-white/10 rounded-[2rem] sm:rounded-[2.5rem] w-full max-w-lg mx-auto shadow-2xl flex flex-col overflow-hidden flex-1 min-h-0">
            <div className="p-4 sm:p-6 border-b border-white/10 bg-zinc-950/70 flex justify-between items-center shrink-0">
              <h3 className="text-lg sm:text-xl font-black text-white flex items-center gap-3">
                <Settings2 className="text-violet-500" size={22} /> Control móvil
              </h3>
              <button onClick={() => setShowMobileControlsModal(false)} className="p-2.5 sm:p-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 rounded-2xl transition-colors"><X size={20}/></button>
            </div>

            {/* Tabs */}
            <div className="flex overflow-x-auto border-b border-white/10 shrink-0 bg-zinc-950/60 [&::-webkit-scrollbar]:hidden">
              <button onClick={() => setMobileActiveTab('media')} className={`min-w-[6.5rem] flex-1 py-3 text-[10px] sm:text-xs font-black uppercase tracking-widest border-b-2 transition-colors ${mobileActiveTab === 'media' ? 'border-violet-500 text-white bg-violet-500/5' : 'border-transparent text-zinc-500'}`}>Bóveda</button>
              <button onClick={() => setMobileActiveTab('songs')} className={`min-w-[6.5rem] flex-1 py-3 text-[10px] sm:text-xs font-black uppercase tracking-widest border-b-2 transition-colors ${mobileActiveTab === 'songs' ? 'border-emerald-500 text-white bg-emerald-500/5' : 'border-transparent text-zinc-500'}`}>Canciones</button>
              <button onClick={() => setMobileActiveTab('liveControls')} className={`min-w-[6.5rem] flex-1 py-3 text-[10px] sm:text-xs font-black uppercase tracking-widest border-b-2 transition-colors ${mobileActiveTab === 'liveControls' ? 'border-amber-500 text-white bg-amber-500/5' : 'border-transparent text-zinc-500'}`}>En Vivo</button>
              <button onClick={() => setMobileActiveTab('messages')} className={`min-w-[6.5rem] flex-1 py-3 text-[10px] sm:text-xs font-black uppercase tracking-widest border-b-2 transition-colors ${mobileActiveTab === 'messages' ? 'border-blue-500 text-white bg-blue-500/5' : 'border-transparent text-zinc-500'}`}>Mensajes</button>
            </div>

            {mobileActiveTab === 'media' ? (
              <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 [&::-webkit-scrollbar]:hidden">
                <div className="flex items-center gap-2 bg-zinc-950 p-2 rounded-2xl border border-zinc-800">
                  {currentFolder && <button onClick={() => setCurrentFolder(null)} className="p-2 bg-zinc-800 rounded-xl text-white" title="Volver"><ChevronLeft size={16}/></button>}
                  <Search size={16} className="text-zinc-500 ml-1" />
                  <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder={currentFolder ? `Buscar en ${currentFolder}...` : 'Buscar en la bóveda...'} className="min-w-0 flex-1 bg-transparent border-none text-sm outline-none focus:ring-0" />
                  <button onClick={crearCarpeta} className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-amber-600 px-2.5 py-2 text-[9px] font-black uppercase text-white"><FolderPlus size={13}/> Carpeta</button>
                  <label className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-violet-600 px-2.5 py-2 text-[9px] font-black uppercase text-white cursor-pointer">
                    <Upload size={13}/> Subir
                    <input type="file" accept="video/mp4, video/webm, image/jpeg, image/png, image/gif" className="hidden" disabled={isUploadingFondo} onChange={handleUploadBackground} />
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-3 pb-24">
                  {!currentFolder && multimediaFolders.filter(f => f.toLowerCase().includes(searchTerm.toLowerCase())).map((folder, i) => (
                    <div key={i} className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-3">
                      <button onClick={() => setCurrentFolder(folder)} className="flex w-full flex-col items-center gap-2">
                        <Folder size={30} className="text-amber-500" fill="currentColor" fillOpacity={0.2}/>
                        <span className="text-[10px] font-black uppercase text-zinc-300 truncate w-full text-center">{folder}</span>
                      </button>
                      <div className="mt-3 grid grid-cols-2 gap-1">
                        <button onClick={(e) => renombrarCarpeta(e, folder)} className="rounded-lg bg-zinc-900 px-2 py-1.5 text-[9px] font-black uppercase text-zinc-400">Renombrar</button>
                        <button onClick={(e) => borrarCarpeta(e, folder)} className="rounded-lg bg-red-500/10 px-2 py-1.5 text-[9px] font-black uppercase text-red-300">Eliminar</button>
                      </div>
                    </div>
                  ))}
                  {uploadingFiles.filter(f => f.folder === (currentFolder || 'root')).map((f) => (
                    <div key={f.id} className="flex aspect-video items-center justify-center rounded-2xl border border-violet-500/40 bg-violet-500/10 text-center text-[10px] font-black uppercase text-violet-200">
                      Subiendo<br />{f.name}
                    </div>
                  ))}
                  {filteredMedia.map((m, i) => (
                    <div key={i} className={`relative overflow-hidden rounded-2xl border-2 bg-zinc-950 ${previewMedia?.url === m.url ? 'border-violet-500' : 'border-zinc-800'}`}>
                      <button onClick={() => setPreviewMedia({ url: m.url, type: m.type, mode: 'foreground', name: m.name })} className="relative block aspect-video w-full overflow-hidden">
                        {m.type === 'video' ? <video src={m.url} className="w-full h-full object-cover opacity-60" /> : <img src={m.url} className="w-full h-full object-cover opacity-60" />}
                        <div className="absolute bottom-0 inset-x-0 bg-black/60 p-1"><p className="text-[8px] font-bold text-white truncate text-center">{m.name}</p></div>
                      </button>
                      <div className="grid grid-cols-3 gap-1 p-1">
                        <button onClick={() => projectMedia({ url: m.url, type: m.type, mode: 'foreground', name: m.name })} className="rounded-lg bg-violet-600 px-1 py-1.5 text-[8px] font-black uppercase text-white">Proy.</button>
                        <button onClick={(e) => renombrarArchivo(e, m.url)} className="rounded-lg bg-zinc-800 px-1 py-1.5 text-[8px] font-black uppercase text-zinc-300">Ren.</button>
                        <button onClick={(e) => borrarArchivo(e, m.url)} className="rounded-lg bg-red-500/10 px-1 py-1.5 text-[8px] font-black uppercase text-red-300">Elim.</button>
                      </div>
                    </div>
                  ))}
                </div>

                {previewMedia && (
                  <div className="absolute bottom-4 left-4 right-4 p-4 bg-zinc-900 border border-violet-500/50 rounded-[2rem] shadow-2xl animate-in slide-in-from-bottom-5">
                    <div className="flex justify-between items-center mb-3">
                      <p className="text-xs font-black text-white truncate pr-4">{previewMedia.name}</p>
                      <button onClick={() => setPreviewMedia(null)}><X size={16} className="text-zinc-500"/></button>
                    </div>
                    <button onClick={() => { projectMedia(previewMedia); setShowMobileControlsModal(false); }} className="w-full py-3 bg-violet-600 text-white rounded-2xl font-black text-xs uppercase shadow-lg">🚀 PROYECTAR AHORA</button>
                  </div>
                )}
              </div>
            ) : mobileActiveTab === 'songs' ? (
              <div className="flex-1 overflow-y-auto p-4 space-y-4 [&::-webkit-scrollbar]:hidden">
                <div className="rounded-3xl border border-emerald-500/25 bg-emerald-500/5 p-4">
                  <div className="flex items-center gap-2 rounded-2xl border border-zinc-800 bg-zinc-950 px-3 py-2.5">
                    <Search size={16} className="shrink-0 text-emerald-400" />
                    <input
                      type="text"
                      value={songSearchTerm}
                      onChange={e => setSongSearchTerm(e.target.value)}
                      placeholder="Buscar por nombre, artista o letra..."
                      className="min-w-0 flex-1 bg-transparent text-sm font-bold text-white outline-none placeholder:text-zinc-600"
                    />
                    {isSearchingGlobal && <Loader2 size={15} className="shrink-0 animate-spin text-emerald-400" />}
                  </div>
                  <p className="mt-3 text-[10px] font-bold leading-snug text-zinc-500">
                    Agrega canciones al setlist desde el celular. Tambien encuentra canciones por frases de la letra.
                  </p>
                </div>

                {cancionesAgregadasTemporales.length > 0 && (
                  <div className="rounded-3xl border border-red-500/20 bg-red-500/5 p-4">
                    <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-red-200">Agregadas en vivo</p>
                    <div className="space-y-2">
                      {cancionesAgregadasTemporales.map((item, idx) => {
                        const song = canciones.find(c => c.id === item.value);
                        if (!song) return null;
                        return (
                          <div key={item.idLocal || `${item.value}-${idx}`} className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-800 bg-zinc-950 px-3 py-2">
                            <button type="button" onClick={() => handleSelectSong(song)} className="min-w-0 flex-1 text-left">
                              <p className="truncate text-xs font-black text-white">{song.titulo}</p>
                              <p className="truncate text-[10px] font-bold text-zinc-500">{song.artista || 'Sin artista'}</p>
                            </button>
                            <button
                              type="button"
                              onClick={(e) => quitarCancionAgregada(item, e)}
                              className="shrink-0 rounded-xl bg-red-600 px-3 py-2 text-[9px] font-black uppercase text-white"
                            >
                              Quitar
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {songSearchTerm.trim() === '' ? (
                  <div className="rounded-3xl border border-dashed border-zinc-800 bg-zinc-950/60 p-6 text-center">
                    <Music size={28} className="mx-auto mb-3 text-zinc-700" />
                    <p className="text-xs font-black uppercase tracking-widest text-zinc-500">Busca una cancion</p>
                    <p className="mt-2 text-[11px] font-bold text-zinc-600">Ejemplo: "a tus pies", "No hay lugar", "Miel San Marcos".</p>
                  </div>
                ) : (
                  <div className="space-y-2 pb-24">
                    {globalSearchResults.map(song => {
                      const searchMatch = getSongSearchMatch(song, songSearchTerm);
                      return (
                        <button
                          key={song.id}
                          type="button"
                          onClick={() => agregarCancionAlSetlist(song)}
                          className="w-full rounded-3xl border border-emerald-500/20 bg-zinc-950/80 p-4 text-left transition-all active:scale-[0.99]"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-black text-white">{song.titulo}</p>
                              <p className="mt-0.5 truncate text-[11px] font-bold text-zinc-500">{song.artista || 'Sin artista'}</p>
                              {searchMatch.field === 'lyrics' && searchMatch.snippet && (
                                <p className="mt-2 line-clamp-2 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-[11px] font-bold leading-snug text-emerald-200">
                                  Letra: {searchMatch.snippet}
                                </p>
                              )}
                            </div>
                            <span className="inline-flex shrink-0 items-center gap-1 rounded-2xl bg-emerald-600 px-3 py-2 text-[9px] font-black uppercase text-white">
                              <Plus size={13} /> Agregar
                            </span>
                          </div>
                        </button>
                      );
                    })}
                    {globalSearchResults.length === 0 && !isSearchingGlobal && (
                      <div className="rounded-3xl border border-zinc-800 bg-zinc-950/70 p-6 text-center">
                        <p className="text-xs font-black uppercase tracking-widest text-zinc-500">Sin resultados</p>
                        <p className="mt-2 text-[11px] font-bold text-zinc-600">Prueba con otra frase de la letra o el artista.</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : mobileActiveTab === 'liveControls' ? (
              <div className="flex-1 overflow-y-auto p-6 space-y-8">
                 <div className="grid grid-cols-2 gap-4">
                    <button onClick={toggleBlackout} className={`p-6 rounded-[2rem] border-2 flex flex-col items-center gap-2 ${isBlackout ? 'bg-red-600 border-red-400' : 'bg-zinc-800 border-zinc-700 text-zinc-400'}`}><PowerOff size={28}/> <span className="text-[10px] font-black uppercase">Apagar</span></button>
                    <button onClick={toggleLogo} className={`p-6 rounded-[2rem] border-2 flex flex-col items-center gap-2 ${isLogoActive ? 'bg-amber-600 border-amber-400' : 'bg-zinc-800 border-zinc-700 text-zinc-400'}`}><Star size={28}/> <span className="text-[10px] font-black uppercase">Logo</span></button>
                 </div>
                 <div className="bg-zinc-950 p-6 rounded-[2.5rem] border border-zinc-800">
                    <h4 className="text-xs font-black text-violet-400 uppercase mb-4 flex items-center gap-2"><Clock size={16}/> Cronómetro</h4>
                    {evento?.proyectorCountdown?.active && (
                      <div className="mb-4 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-emerald-300">
                        <p className="text-[10px] font-black uppercase tracking-widest">Cronómetro activo</p>
                        <p className="font-mono text-2xl font-black">{countdownTimeLeft}</p>
                      </div>
                    )}
                    <div className="flex items-center gap-4">
                      <input type="number" value={countdownMinutes} onChange={e => setCountdownMinutes(e.target.value)} className="w-24 bg-zinc-900 border border-zinc-700 rounded-2xl py-3 text-center text-xl font-black text-white" />
                      <button onClick={() => toggleCountdown(true)} className={`flex-1 py-4 text-white rounded-2xl font-black text-xs active:scale-95 shadow-lg shadow-emerald-900/20 ${evento?.proyectorCountdown?.active ? 'bg-emerald-500 ring-2 ring-emerald-300/50' : 'bg-emerald-600'}`}>
                        {evento?.proyectorCountdown?.active ? 'CRONÓMETRO ACTIVO' : 'INICIAR'}
                      </button>
                      <button onClick={() => toggleCountdown(false)} className="p-4 bg-zinc-800 text-zinc-500 rounded-2xl"><X size={20}/></button>
                    </div>
                 </div>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto p-4 space-y-4 [&::-webkit-scrollbar]:hidden">
                <div className="rounded-3xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h4 className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-amber-300"><ShieldCheck size={15}/> Predicador</h4>
                      <p className="mt-1 text-[10px] font-bold text-amber-100/70">Privado / Solo Predicador</p>
                      <p className="mt-1 text-[10px] font-bold text-zinc-500">
                        {preacherLastUpdated ? `Última actualización: ${new Date(preacherLastUpdated).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}` : 'No hay mensaje activo para el Pastor.'}
                      </p>
                    </div>
                    <button onClick={() => setShowMobilePreacherSheet(true)} className="rounded-2xl bg-amber-600 px-4 py-3 text-[10px] font-black uppercase text-white">Gestionar</button>
                  </div>
                </div>

                <div className="rounded-3xl border border-zinc-800 bg-zinc-950/70 p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-amber-400"><AlertCircle size={15}/> Retorno</h4>
                    <div className="flex gap-2">
                      <button onClick={() => setAlertaTarget('cantantes')} className={`rounded-xl border px-2 py-1 text-[10px] font-bold ${alertaTarget === 'cantantes' ? 'border-pink-400 bg-pink-500/15 text-pink-200' : 'border-zinc-700 text-zinc-300'}`}>Cantantes</button>
                      <button onClick={() => setAlertaTarget('musicos')} className={`rounded-xl border px-2 py-1 text-[10px] font-bold ${alertaTarget === 'musicos' ? 'border-emerald-400 bg-emerald-500/15 text-emerald-200' : 'border-emerald-900/60 text-emerald-300'}`}>Musicos</button>
                      <button onClick={() => setAlertaTarget('all')} className={`rounded-xl border px-2 py-1 text-[10px] font-bold ${alertaTarget === 'all' ? 'border-blue-400 bg-blue-500/15 text-blue-200' : 'border-zinc-700 text-zinc-300'}`}>Todos</button>
                    </div>
                  </div>
                  {evento?.proyectorAlerta ? (
                    <div className="flex items-center justify-between gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-3 py-2">
                      <span className="min-w-0 truncate text-[10px] font-bold text-amber-100">
                        {typeof evento.proyectorAlerta === 'string' ? `Activo: ${evento.proyectorAlerta}` : `Activo para ${evento.proyectorAlerta.target === 'all' ? 'Todos' : evento.proyectorAlerta.target === 'cantantes' ? 'Cantantes' : 'Musicos'}: ${evento.proyectorAlerta.text}`}
                      </span>
                      <button onClick={limpiarAlerta} className="rounded-xl bg-zinc-800 px-3 py-1.5 text-[10px] font-black uppercase text-zinc-200">Ocultar</button>
                    </div>
                  ) : (
                    <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">Sin mensaje activo</p>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    {['Repite coro', 'Solo voces', 'Entramos todos', 'Final', 'Sube tono', 'Baja dinámica', 'Más suave', 'Corte', 'Espera', 'Sigue', 'Puente', 'Ministración'].map(msg => (
                      <button key={msg} onClick={() => enviarAlerta(msg)} className="rounded-xl bg-zinc-900 px-3 py-2 text-[10px] font-black uppercase text-zinc-300 active:scale-95">{msg}</button>
                    ))}
                  </div>
                  <div className="grid grid-cols-3 gap-1 rounded-2xl bg-zinc-900 p-1">
                    {['normal', 'importante', 'urgente'].map(level => (
                      <button key={level} onClick={() => setAlertaPriority(level)} className={`rounded-xl px-2 py-2 text-[9px] font-black uppercase ${alertaPriority === level ? (level === 'urgente' ? 'bg-red-600 text-white' : level === 'importante' ? 'bg-amber-500 text-zinc-950' : 'bg-emerald-600 text-white') : 'text-zinc-500'}`}>{level}</button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input value={alertaTarima} onChange={e => setAlertaTarima(e.target.value)} placeholder="Mensaje a tarima..." className="min-w-0 flex-1 rounded-2xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-white outline-none focus:border-amber-500" />
                    <button onClick={enviarAlerta} disabled={isSendingAlert || !alertaTarima.trim()} className="rounded-2xl bg-amber-600 px-4 text-white disabled:opacity-50"><Send size={16}/></button>
                  </div>
                  <button onClick={() => handleOpenScreen(`/retorno-musicos/${eventoId}`)} className="w-full rounded-2xl border border-zinc-800 px-3 py-2 text-[10px] font-black uppercase text-zinc-400">Abrir retorno</button>
                </div>

                <div className="rounded-3xl border border-blue-500/20 bg-blue-500/5 p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-blue-300"><Megaphone size={15}/> Congregación</h4>
                    <span className="text-[10px] font-bold uppercase text-blue-200">{evento?.proyectorTicker ? 'Anuncio activo' : 'Sin anuncio'}</span>
                  </div>
                  {evento?.proyectorTicker && (
                    <div className="flex items-center justify-between gap-2 rounded-2xl border border-blue-500/30 bg-blue-500/10 px-3 py-2">
                      <span className="min-w-0 truncate text-[10px] font-bold text-blue-100">{evento.proyectorTicker}</span>
                      <button onClick={limpiarTicker} className="rounded-xl bg-zinc-800 px-3 py-1.5 text-[10px] font-black uppercase text-zinc-200">Ocultar</button>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <input value={tickerMsg} onChange={e => setTickerMsg(e.target.value)} placeholder="Anuncio público..." className="min-w-0 flex-1 rounded-2xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500" />
                    <button onClick={enviarTicker} disabled={isSendingTicker || !tickerMsg.trim()} className="rounded-2xl bg-blue-600 px-4 text-white disabled:opacity-50"><Send size={16}/></button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {showMobilePreacherSheet && (
        <div className="fixed inset-0 z-[260] flex flex-col bg-black/85 p-3 backdrop-blur-xl">
          <div className="mx-auto flex min-h-0 w-full max-w-lg flex-1 flex-col overflow-hidden rounded-[2rem] border border-amber-500/25 bg-zinc-900 shadow-2xl">
            <div className="shrink-0 border-b border-zinc-800 bg-amber-500/10 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="flex items-center gap-2 text-lg font-black uppercase tracking-wide text-amber-200"><ShieldCheck size={20}/> Predicador</h3>
                  <p className="mt-1 text-[10px] font-black uppercase tracking-widest text-amber-100/70">Privado / Solo Predicador</p>
                  <p className="mt-1 text-[10px] font-bold text-zinc-400">
                    {preacherLastUpdated ? `Última actualización: ${new Date(preacherLastUpdated).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}` : 'No hay mensaje activo para el Pastor.'}
                  </p>
                </div>
                <button onClick={() => setShowMobilePreacherSheet(false)} className="rounded-2xl bg-zinc-800 p-3 text-zinc-300"><X size={18}/></button>
              </div>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto p-4 [&::-webkit-scrollbar]:hidden">
              <div className="grid grid-cols-1 gap-3">
                <input value={preacherDraft.tema} onChange={e => updatePreacherDraft('tema', e.target.value)} placeholder="Tema" className="rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-white outline-none focus:border-amber-500" />
                <input value={preacherDraft.tiempoRestante} onChange={e => updatePreacherDraft('tiempoRestante', e.target.value)} placeholder="Tiempo restante (ej. 20:00)" className="rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-white outline-none focus:border-amber-500" />
                <input value={preacherDraft.puntoActual} onChange={e => updatePreacherDraft('puntoActual', e.target.value)} placeholder="Punto actual" className="rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-white outline-none focus:border-amber-500" />
                <input value={preacherDraft.siguientePunto} onChange={e => updatePreacherDraft('siguientePunto', e.target.value)} placeholder="Siguiente punto" className="rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-white outline-none focus:border-amber-500" />
                <textarea value={preacherDraft.versiculoActual} onChange={e => updatePreacherDraft('versiculoActual', e.target.value)} placeholder="Versículo actual" rows={3} className="rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-white outline-none focus:border-blue-500 resize-none" />
                <textarea value={preacherDraft.notasPrivadas} onChange={e => updatePreacherDraft('notasPrivadas', e.target.value)} placeholder="Notas privadas" rows={4} className="rounded-2xl border border-amber-500/20 bg-zinc-950 px-4 py-3 text-sm text-amber-50 outline-none focus:border-amber-500 resize-none" />
                <input value={preacherDraft.mensajesInternos} onChange={e => updatePreacherDraft('mensajesInternos', e.target.value)} placeholder="Mensaje privado al Pastor" className="rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-white outline-none focus:border-cyan-500" />
                <input value={preacherDraft.indicaciones} onChange={e => updatePreacherDraft('indicaciones', e.target.value)} placeholder="Indicación" className="rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-white outline-none focus:border-red-500" />
              </div>
            </div>

            <div className="shrink-0 border-t border-zinc-800 bg-zinc-950 p-3">
              <div className="grid grid-cols-3 gap-2">
                <button onClick={sendToPreacher} className="rounded-2xl bg-amber-600 px-3 py-3 text-[10px] font-black uppercase text-white">Enviar</button>
                <button onClick={() => handleOpenScreen(`/predicador/${eventoId}`)} className="rounded-2xl border border-amber-500/30 px-3 py-3 text-[10px] font-black uppercase text-amber-200">Abrir</button>
                <button onClick={clearPreacherDisplay} className="rounded-2xl bg-zinc-800 px-3 py-3 text-[10px] font-black uppercase text-zinc-300">Limpiar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal para Subir/Seleccionar Fondos */}
      {showFondosModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 rounded-3xl border border-zinc-800 p-6 max-w-md w-full shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-bold text-white flex items-center gap-2"><ImageIcon size={20} className="text-indigo-400"/> Imagen o Video de Fondo</h3>
              <button onClick={() => setShowFondosModal(false)} className="text-zinc-500 hover:text-white"><X size={20}/></button>
            </div>
            
            <div className="space-y-4">
              <div className="p-4 bg-zinc-950 rounded-2xl border border-zinc-800 text-center">
                <p className="text-xs text-zinc-400 mb-4">Sube un video MP4/WebM, GIF o imagen para usarlo como fondo en bucle. Se almacenara en Cloudinary.</p>
                
                <label className={`w-full py-4 rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-2 transition-colors cursor-pointer ${isUploadingFondo ? 'border-indigo-500/50 bg-indigo-500/10' : 'border-zinc-700 bg-zinc-800/50 hover:bg-zinc-800 hover:border-indigo-500'}`}>
                  {isUploadingFondo ? <Loader2 size={24} className="text-indigo-500 animate-spin" /> : <Upload size={24} className="text-zinc-400" />}
                  <span className="text-sm font-bold text-zinc-300">{isUploadingFondo ? 'Subiendo archivo...' : 'Seleccionar Archivo'}</span>
                  <input type="file" accept="video/mp4, video/webm, image/jpeg, image/png, image/gif" className="hidden" disabled={isUploadingFondo} onChange={(event) => handleUploadBackground(event, { applyAsBackground: true })} />
                </label>
              </div>

              {activeSongId && (
                <label className="flex items-center gap-3 p-3 bg-zinc-800/50 rounded-xl cursor-pointer border border-zinc-700/50 hover:bg-zinc-800 transition-colors">
                  <input type="checkbox" checked={guardarEnCancion} onChange={e => setGuardarEnCancion(e.target.checked)} className="w-5 h-5 rounded text-indigo-500 focus:ring-indigo-500 bg-zinc-900 border-zinc-700" />
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-white leading-none mb-1">Guardar en la cancion</span>
                    <span className="text-[10px] text-zinc-400 leading-tight">Este fondo se pondrá automáticamente la próxima vez que toques "{activeSong?.titulo}".</span>
                  </div>
                </label>
              )}

              {fondoActivo && (
                <button onClick={quitarFondo} className="w-full py-3 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-xl font-bold text-sm transition-colors border border-red-500/20">
                  Quitar Fondo (Pantalla Negra)
                </button>
              )}
            </div>
          </div>
        </div>
      )}


      {/* 🚀 MODAL DE CONFIRMACION (Borrar) */}
      {confirmModal.show && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4 animate-in fade-in duration-200">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 max-w-sm w-full shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="w-12 h-12 bg-red-500/10 rounded-2xl flex items-center justify-center mb-4">
              <Trash2 className="text-red-500" size={24} />
            </div>
            <h3 className="text-lg font-black text-white mb-2">{confirmModal.title}</h3>
            <p className="text-sm text-zinc-400 leading-relaxed mb-6">{confirmModal.message}</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmModal({ ...confirmModal, show: false })} className="flex-1 py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold rounded-xl transition-colors">Cancelar</button>
              <button onClick={confirmModal.onConfirm} className="flex-1 py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl shadow-lg shadow-red-900/20 transition-colors">Eliminar</button>
            </div>
          </div>
        </div>
      )}

      {/* 📝 MODAL DE ENTRADA (Renombrar / Crear) */}
      {inputModal.show && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4 animate-in fade-in duration-200">
          <form 
            onSubmit={(e) => { e.preventDefault(); inputModal.onConfirm(inputModal.value); }}
            className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 max-w-sm w-full shadow-2xl animate-in zoom-in-95 duration-200"
          >
            <div className="w-12 h-12 bg-indigo-500/10 rounded-2xl flex items-center justify-center mb-4">
              <Edit2 className="text-indigo-500" size={24} />
            </div>
            <h3 className="text-lg font-black text-white mb-4">{inputModal.title}</h3>
            
            <input 
              autoFocus
              type="text" 
              value={inputModal.value}
              onChange={(e) => setInputModal({ ...inputModal, value: e.target.value, error: '' })}
              className={`w-full bg-zinc-950 border ${inputModal.error ? 'border-red-500' : 'border-zinc-700'} rounded-xl px-4 py-3 text-white outline-none focus:border-indigo-500 transition-all mb-1`}
              placeholder="Escribe el nombre aquí..."
            />
            {inputModal.error && <p className="text-[10px] text-red-500 font-bold ml-1 mb-4">{inputModal.error}</p>}
            
            <div className="flex gap-3 mt-6">
              <button 
                type="button"
                onClick={() => setInputModal({ ...inputModal, show: false })} 
                className="flex-1 py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold rounded-xl transition-colors"
              >
                Cancelar
              </button>
              <button 
                type="submit"
                className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-lg shadow-indigo-900/20 transition-colors"
              >
                Guardar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 🔍 MODAL: PREVISUALIZADOR GRANDE (Bóveda) */}
      {largePreview && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-md flex items-center justify-center z-[150] p-4 animate-in fade-in zoom-in-95 duration-200">
          <div className="relative max-w-4xl w-full flex flex-col items-center">
            <button 
              onClick={() => setLargePreview(null)}
              className="absolute -top-12 right-0 p-2 text-zinc-400 hover:text-white flex items-center gap-2 font-bold"
            > {/* Botón para cerrar la vista previa grande */}
              <X size={24}/> CERRAR
            </button>
            <button 
              onClick={() => { projectMedia(largePreview); setLargePreview(null); }}
              className="absolute -top-12 left-0 p-2 bg-violet-600 text-white hover:bg-violet-500 rounded-xl px-6 font-black flex items-center gap-2 shadow-lg transition-all active:scale-95"
            >
              <Send size={18}/> PROYECTAR AHORA
            </button> {/* Botón para proyectar directamente desde la vista previa grande */}

            <div className="w-full aspect-video bg-zinc-900 rounded-3xl overflow-hidden border border-white/10 shadow-2xl">
              {largePreview.type === 'video' ? (
                <video src={largePreview.url} autoPlay loop controls className="w-full h-full object-contain" />
              ) : (
                <img src={largePreview.url} className="w-full h-full object-contain" />
              )}
            </div>
            <p className="mt-4 text-zinc-400 font-bold">{largePreview.name}</p>
          </div>
        </div>
      )}

      {/* 📺 MODAL: GESTOR DE MATRIZ DE SALIDAS */}
      {showOutputsModal && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-xl flex items-center justify-center z-[150] p-4 animate-in fade-in duration-300">
          <div className="bg-zinc-900 border border-zinc-800 rounded-[2.5rem] w-full max-w-4xl max-h-[90vh] shadow-2xl flex flex-col overflow-hidden">
            <div className="p-8 border-b border-zinc-800 bg-zinc-900/50 flex justify-between items-center">
              <div>
                <h3 className="text-2xl font-black text-white flex items-center gap-3"><Tv className="text-violet-500" size={28} /> Configurar Matriz</h3>
                <p className="text-zinc-500 text-sm font-medium mt-1">Define qué contenido se envía a cada pantalla física o virtual.</p>
              </div>
              <button onClick={() => setShowOutputsModal(false)} className="p-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 rounded-2xl transition-colors"><X size={24}/></button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Object.entries(outputs).map(([id, out]) => (
                  <div key={id} className="bg-zinc-950 border border-zinc-800 rounded-3xl p-5 space-y-4">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <input 
                          type="text" value={out.label}
                          onChange={(e) => handleUpdateOutput(id, { label: e.target.value })}
                          className="bg-transparent border-none text-lg font-black text-white p-0 focus:ring-0 w-full"
                        />
                        <div className="flex gap-2 mt-2">
                          {['proyector', 'preacher', 'retorno', 'musicos'].map(t => (
                            <button 
                              key={t} onClick={() => handleUpdateOutput(id, { type: t })}
                              className={`px-2 py-1 rounded-md text-[9px] font-black uppercase border ${out.type === t ? 'bg-violet-600 border-violet-500 text-white' : 'border-zinc-800 text-zinc-600'}`}
                            >
                              {t === 'proyector' ? 'Público' : t === 'preacher' ? 'Predicador' : t === 'retorno' ? 'Stage' : 'Banda'}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => handleIdentifyOutput(id)} className="p-2 text-zinc-800 hover:text-blue-500 transition-colors" title="Identificar Pantalla"><Fingerprint size={18}/></button>
                        <button onClick={() => eliminarOutput(id)} className="p-2 text-zinc-800 hover:text-red-500 transition-colors"><Trash2 size={18}/></button>
                      </div>
                    </div>
                    <select 
                      value={out.screenId || ''}
                      onChange={(e) => handleUpdateOutput(id, { screenId: e.target.value })}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs font-bold text-zinc-400"
                    >
                      <option value="">Ventana normal</option>
                      {availableScreens.map((s, idx) => (
                        <option key={s.id || idx} value={s.id}>Monitor {idx + 1} ({s.width}x{s.height})</option>
                      ))}
                    </select>
                  </div>
                ))}
                <button 
                  onClick={crearOutput}
                  className="border-2 border-dashed border-zinc-800 rounded-3xl flex flex-col items-center justify-center p-8 text-zinc-600 hover:text-violet-500 transition-all gap-2"
                >
                  <Plus size={32} /> <span className="font-black text-xs uppercase">Añadir Salida</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 📅 MODAL: CAMBIAR DE EVENTO / SETLIST RÁPIDAMENTE */}
      {showEventList && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-xl flex items-center justify-center z-[200] p-4 animate-in fade-in duration-300">
          <div className="bg-zinc-900 border border-zinc-800 rounded-[2.5rem] w-full max-w-lg shadow-2xl flex flex-col overflow-hidden">
            <div className="p-8 border-b border-zinc-800 bg-zinc-900/50 flex justify-between items-center">
              <div>
                <h3 className="text-2xl font-black text-white flex items-center gap-3">
                  <Layers className="text-blue-500" size={28} /> Cambiar Setlist
                </h3>
                <p className="text-zinc-500 text-sm font-medium mt-1">Selecciona el evento que deseas controlar ahora.</p>
              </div>
              <button onClick={() => setShowEventList(false)} className="p-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 rounded-2xl transition-colors"><X size={24}/></button>
            </div>

            <div className="p-6 space-y-3 overflow-y-auto max-h-[60vh] [&::-webkit-scrollbar]:hidden">
              {/* Opción para volver al modo Libre (Global) */}
              <button 
                onClick={() => { navigate('/control-proyector/global'); setShowEventList(false); }}
                className={`w-full flex items-center justify-between p-5 rounded-3xl border transition-all group ${eventoId === 'global' ? 'bg-violet-600 border-violet-500 text-white' : 'bg-zinc-950 border-zinc-800 hover:border-zinc-600'}`}
              >
                <div className="text-left">
                  <p className="font-black text-lg">Control Libre</p>
                  <p className={`text-xs font-bold ${eventoId === 'global' ? 'text-violet-200' : 'text-zinc-500'}`}>Solo multimedia y logos</p>
                </div>
                <Monitor size={24} className={eventoId === 'global' ? 'text-white' : 'text-zinc-700'} />
              </button>

              <div className="h-px bg-zinc-800 my-4"></div>
              <p className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] px-2 mb-2">Próximos Eventos</p>

              {upcomingEvents.map(ev => (
                <button 
                  key={ev.id}
                  onClick={() => { navigate(`/control-proyector/${ev.id}`); setShowEventList(false); }}
                  className={`w-full flex items-center justify-between p-5 rounded-3xl border transition-all group ${eventoId === ev.id ? 'bg-violet-600 border-violet-500 text-white' : 'bg-zinc-800/50 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800'}`}
                >
                  <div className="text-left">
                    <p className="font-black text-base truncate max-w-[250px]">{ev.titulo}</p>
                    <p className={`text-xs font-bold ${eventoId === ev.id ? 'text-violet-200' : 'text-zinc-500'}`}>{formatFriendlyDate(ev.fecha)}</p>
                  </div>
                  <ChevronRight size={20} className={eventoId === ev.id ? 'text-white' : 'text-zinc-600'} />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <BiblePicker
        open={isBibleOutlinePickerOpen}
        onClose={closeBibleOutlinePicker}
        title={editingBibleOutlineItem ? 'Editar pasaje del bosquejo' : 'Agregar pasaje al bosquejo'}
        primaryActionLabel={editingBibleOutlineItem ? 'Guardar cambios' : 'Agregar al bosquejo'}
        onPrimaryAction={saveBibleOutlinePassage}
        onPreviewChange={setOutlinePickerPreview}
        preparedPreview={outlinePickerPreview}
      />
      {screensMenu}
    </div>
  );
};
export default ProyectorController;
