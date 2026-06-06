import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, getDocs, setDoc, onSnapshot, query, collection, where, orderBy, limit, updateDoc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { parsearCancion } from '../../utils/songParser';
import { Monitor, Play, Pause, PowerOff, X, ArrowLeft, Layers, Type, Eye, Image as ImageIcon, Upload, Loader2, Eraser, AlertCircle, Send, Tv, Star, Megaphone, ChevronRight, Zap, Film, RotateCcw, Rewind, FastForward, Volume2, Folder, FolderPlus, ChevronLeft, Trash2, Edit2, Plus, Fingerprint, Send as SendIcon, Search, SearchCode, Settings2, Clock } from 'lucide-react';
import { traducirAcorde } from '../../utils/musicCore';

const ProyectorController = ({ user }) => {
  const { eventoId } = useParams();
  const navigate = useNavigate();
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

  const [confirmModal, setConfirmModal] = useState({ show: false, title: '', message: '', onConfirm: null });
  const [inputModal, setInputModal] = useState({ show: false, title: '', value: '', onConfirm: null, error: '' });

  const [displayLiveSlide, setDisplayLiveSlide] = useState(null);
  const [fadeState, setFadeState] = useState('in');
  const [alertaTarima, setAlertaTarima] = useState('');
  const [isSendingAlert, setIsSendingAlert] = useState(false);
  const [tickerMsg, setTickerMsg] = useState('');
  const [isSendingTicker, setIsSendingTicker] = useState(false);
  const liveVideoRef = useRef(null); // Ref para el video en la vista "En Vivo"
  const livePreviewMediaRef = useRef(null); // Ref para el video en la vista "Pre-proyección"
  const [countdownMinutes, setCountdownMinutes] = useState(5);

  // 🔄 LIMPIADOR DE MEMORIA: Reiniciar estados cuando cambia el evento
  useEffect(() => {
    setActiveSongId(null);
    setPreviewSlide(null);
    setPreviewMedia(null);
    setLiveSlide(null);
    setMediaActive(null);
    setFondoActivo(null);
    setDisplayLiveSlide(null);
    setCurrentFolder(null); // 📂 Resetear carpeta al cambiar de evento
    setSearchTerm(''); // 🔍 Limpiar búsqueda
    setIsLogoActive(false);
    setIsBlackout(false);
  }, [eventoId]);

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
      setUpcomingEvents(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    };
    fetchUpcoming();

    const fetchEvent = async () => {
      try {
        const eventoSnap = await getDoc(doc(db, 'eventos', eventoId));
        if (eventoSnap.exists()) {
          const evData = eventoSnap.data();
          
          // Cargar canciones (solo si no es modo global)
          if (eventoId !== 'global') {
            const songIds = evData.setlist ? evData.setlist.filter(i => i.type === 'song').map(i => i.value) : (evData.canciones || []);
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
        
        // MIGRACIÓN REFORZADA: Si el doc existe pero las carpetas no, intentamos traerlas de 'global'
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
        // MIGRACIÓN: Si el nuevo documento no existe, intentamos recuperar del antiguo 'global'
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
        setLiveSlide(data.proyectorSlide || null);
        setIsBlackout(data.proyectorApagado ?? false);
        setFondoActivo(data.proyectorFondo || null);
        setTransicionActiva(data.proyectorTransicion || 'fade');
        setModoTransmision(data.proyectorModoTransmision ?? false);
        setIsLogoActive(data.proyectorLogo ?? false);
        setMediaActive(data.proyectorMedia || null);
        
        // Si la media activa en el proyector es nula, limpiamos la previsualización local
        if (!data.proyectorMedia) setPreviewMedia(null);
        if (!data.proyectorSlide) setPreviewSlide(null);
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
        const qAll = query(collection(db, 'canciones'), limit(50));
        const snap = await getDocs(qAll);
        const results = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(c => 
            c.titulo.toLowerCase().includes(songSearchTerm.toLowerCase()) || 
            c.artista?.toLowerCase().includes(songSearchTerm.toLowerCase())
          );
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

  // Convertir las secciones en Diapositivas (Slides)
  const slides = [];
  secciones.forEach(sec => {
    let texto = sec.lineas.map(linea => 
      linea.map(palabra => palabra.map(silaba => silaba.texto === '\u00A0' ? '' : silaba.texto).join('')).join(' ')
    ).join('\n');
    slides.push({ titulo: sec.titulo, texto: texto.trim() || ' ', lineas: sec.lineas, originalIndex: slides.length });
  });

  const formatFriendlyDate = (dateValue) => {
    if (!dateValue) return "Fecha pendiente";
    let d;
    if (dateValue.toDate) d = dateValue.toDate(); // Si es Timestamp de Firebase
    else d = new Date(String(dateValue).includes('T') ? dateValue : `${dateValue}T12:00:00`);
    
    if (isNaN(d.getTime())) return "Por programar";
    return d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
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
    
    let nextSlide = null;
    if (slide.originalIndex !== undefined && slide.originalIndex < slides.length - 1) {
      nextSlide = slides[slide.originalIndex + 1];
    }

    // Encontrar el siguiente elemento del setlist (Canción o Nota)
    let offset = 0;
    let nextSongInfo = null;
    if (evento && activeSongId) {
      const setlistItems = evento.setlist || (evento.canciones || []).map(id => ({ type: 'song', value: id }));
      const activeIdx = setlistItems.findIndex(i => i.type === 'song' && i.value === activeSongId);
      if (activeIdx !== -1 && activeIdx < setlistItems.length - 1) {
        const nextElement = setlistItems[activeIdx + 1];
        if (nextElement.type === 'note') {
          nextSongInfo = `📌 ${nextElement.value}`;
        } else {
          const nextSongObj = canciones.find(c => c.id === nextElement.value);
          if (nextSongObj) {
            let tonoFinal = nextSongObj.tonoOriginal;
            const cantante = evento.cantantesPorCancion?.[nextSongObj.id];
            if (cantante && nextSongObj.tonosAlternativos) {
              const opciones = nextSongObj.tonosAlternativos.split(',');
              const match = opciones.find(o => o.trim().toLowerCase().startsWith(cantante.toLowerCase() + ':'));
              if (match) tonoFinal = match.split(':')[1].trim();
            }
            nextSongInfo = `🎵 ${nextSongObj.titulo} (${traducirAcorde(tonoFinal || 'C', formatoAcordes, notacion)})`;
          }
        }
      }

      // Calcular la transposición actual para la Pantalla de Músicos
      const cancionActiva = canciones.find(c => c.id === activeSongId);
      const cantanteActivo = evento.cantantesPorCancion?.[activeSongId];
      if (cancionActiva && cantanteActivo && cancionActiva.tonosAlternativos) {
        const opciones = cancionActiva.tonosAlternativos.split(',');
        const match = opciones.find(o => o.trim().toLowerCase().startsWith(cantanteActivo.toLowerCase() + ':'));
        if (match) {
          const tonoDestino = match.split(':')[1].trim();
          const NOTAS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
          const oMatch = cancionActiva.tonoOriginal?.match(/^[A-G]#?/);
          const tMatch = tonoDestino.match(/^[A-G]#?/);
          if (oMatch && tMatch) {
            let diff = NOTAS.indexOf(tMatch[0]) - NOTAS.indexOf(oMatch[0]);
            if (diff > 6) diff -= 12;
            if (diff < -5) diff += 12;
            offset = diff;
          }
        }
      }
    }

    const updates = {
      proyectorSlide: { titulo: slide.titulo, texto: slide.texto, lineas: slide.lineas ? JSON.stringify(slide.lineas) : null },
      proyectorSongId: activeSongId,
      proyectorSlideIndex: slide.originalIndex ?? -1,
      proyectorNextSlide: nextSlide ? { titulo: nextSlide.titulo, texto: nextSlide.texto, lineas: nextSlide.lineas ? JSON.stringify(nextSlide.lineas) : null } : null,
      proyectorNextSong: nextSongInfo,
      proyectorOffset: offset,
      proyectorLogo: false,
      proyectorApagado: false,
      proyectorMedia: null, // Limpiar cualquier media activa al proyectar una diapositiva
    };
    setPreviewMedia(null); // Limpiar la pre-selección de media localmente

    try { await setDoc(doc(db, 'eventos', eventoId), updates, { merge: true }); } 
    catch (e) { console.error("Error al proyectar diapositiva:", e); }
  };

   // ➕ Agregar canción externa al evento actual
  const agregarCancionAlSetlist = async (song) => {
    if (!evento) return;
    
    const itemActualizado = { type: 'song', value: song.id, idLocal: `extra_${Date.now()}` };
    const nuevoSetlist = [...(evento.setlist || []), itemActualizado];
    
    try {
      await updateDoc(doc(db, 'eventos', eventoId), { setlist: nuevoSetlist });
      // Actualizar estado local para que aparezca en la lista izquierda
      setCanciones(prev => [...prev, song]);
      setActiveSongId(song.id);
      setSongSearchTerm(''); // Limpiar búsqueda
    } catch (e) {
      console.error("Error agregando canción de última hora:", e);
    }
  };

  const projectMedia = async (mediaObj) => {
    if (!mediaObj) return;
    const updates = {
      proyectorMedia: { ...mediaObj, playing: true, volume: 1, mode: 'foreground' },
      proyectorSlide: null,
      proyectorSongId: null,
      proyectorSlideIndex: -1,
      proyectorNextSlide: null,
      proyectorNextSong: null,
      proyectorLogo: false,
      proyectorApagado: false,
    };
    try { await setDoc(doc(db, 'eventos', eventoId), updates, { merge: true }); } 
    catch (e) { console.error(e); }
  };

  const handleTransicionChange = async (e) => {
    const nuevaTransicion = e.target.value;
    setTransicionActiva(nuevaTransicion);
    try { await setDoc(doc(db, 'eventos', eventoId), { proyectorTransicion: nuevaTransicion }, { merge: true }); } catch(e) { console.error(e); }
  };

  const toggleBlackout = async () => {
    try { await setDoc(doc(db, 'eventos', eventoId), { proyectorApagado: !isBlackout }, { merge: true }); } 
    catch (e) { console.error(e); }
  };

  const toggleTransmision = async () => {
    try { await setDoc(doc(db, 'eventos', eventoId), { proyectorModoTransmision: !modoTransmision }, { merge: true }); } 
    catch (e) { console.error(e); }
  };

  const toggleLogo = async () => {
    try { await setDoc(doc(db, 'eventos', eventoId), { proyectorLogo: !isLogoActive, proyectorApagado: false }, { merge: true }); } 
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
    await updateDoc(doc(db, 'eventos', eventoId), { proyectorMedia: null });
    setPreviewMedia(null); // Limpiar también la vista previa local al detener
  };

  const toggleCountdown = async (active) => {
    const mins = parseInt(countdownMinutes) || 5;
    const endTimestamp = active ? Date.now() + (mins * 60000) : null;
    try {
      await setDoc(doc(db, 'eventos', eventoId), {
        proyectorCountdown: { active, endTimestamp: endTimestamp }
      }, { merge: true });
    } catch (e) { console.error(e); }
  };

  const botonPanico = async () => {
    await setDoc(doc(db, 'eventos', eventoId), { 
      proyectorSlide: null, proyectorMedia: null, proyectorLogo: false, proyectorApagado: true, proyectorAlerta: null, proyectorTicker: null 
    }, { merge: true });
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

  const handleUploadCloudinary = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const uploadId = Date.now();
    const fileType = file.type.startsWith('video') ? 'video' : 'image';
    setUploadingFiles(prev => [...prev, { id: uploadId, name: file.name, type: fileType, folder: currentFolder || 'root' }]);
    setIsUploadingFondo(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", "KADOSH");

    try {
      // auto/upload soporta tanto videos como imágenes en Cloudinary
      const res = await fetch("https://api.cloudinary.com/v1_1/dgi9l8blg/auto/upload", {
        method: "POST",
        body: formData
      });
      const data = await res.json();
      
      if (data.secure_url) {
        const nuevaLib = [...multimediaLib, { 
          url: data.secure_url, 
          type: data.resource_type, 
          name: file.name,
          folder: currentFolder || 'root'
        }];

        // Actualizamos el fondo del evento actual, pero los archivos a la Bóveda Global
        await setDoc(doc(db, 'eventos', eventoId), { 
          proyectorFondo: data.secure_url
        }, { merge: true });
        await setDoc(doc(db, 'sistema', 'multimedia'), { 
          multimediaLib: nuevaLib 
        }, { merge: true });
        
        // Si es una canción real (no modo global), guardamos la referencia
        if (eventoId !== 'global' && activeSongId && guardarEnCancion) {
          await setDoc(doc(db, 'canciones', activeSongId), { fondoUrl: data.secure_url }, { merge: true });
          setCanciones(prev => prev.map(c => c.id === activeSongId ? { ...c, fondoUrl: data.secure_url } : c));
        }
      }
    } catch (err) {
      console.error("Error subiendo a Cloudinary", err);
      alert("Hubo un error subiendo el fondo.");
    } finally {
      setIsUploadingFondo(false);
      setShowFondosModal(false);
      setUploadingFiles(prev => prev.filter(f => f.id !== uploadId));
    }
  };

  const quitarFondo = async () => {
    await setDoc(doc(db, 'eventos', eventoId), { proyectorFondo: null }, { merge: true });
    
    if (eventoId !== 'global' && activeSongId && guardarEnCancion) {
      await setDoc(doc(db, 'canciones', activeSongId), { fondoUrl: null }, { merge: true });
      setCanciones(prev => prev.map(c => c.id === activeSongId ? { ...c, fondoUrl: null } : c));
    }
    setShowFondosModal(false);
  };

  // Lógica para enviar mensajes a tarima
  const enviarAlerta = async () => {
    if (!alertaTarima.trim()) return;
    setIsSendingAlert(true);
    try {
      await setDoc(doc(db, 'eventos', eventoId), { proyectorAlerta: alertaTarima }, { merge: true });
      setAlertaTarima('');
      // Auto-limpiar alerta a los 10 segundos
      setTimeout(async () => {
         await setDoc(doc(db, 'eventos', eventoId), { proyectorAlerta: null }, { merge: true });
      }, 10000);
    } catch (e) { console.error(e); } finally { setIsSendingAlert(false); }
  };
  const limpiarAlerta = async () => {
    await setDoc(doc(db, 'eventos', eventoId), { proyectorAlerta: null }, { merge: true });
  };

  // Lógica para enviar Marquesina (Ticker) Público
  const enviarTicker = async () => {
    if (!tickerMsg.trim()) return;
    setIsSendingTicker(true);
    try { await setDoc(doc(db, 'eventos', eventoId), { proyectorTicker: tickerMsg }, { merge: true }); setTickerMsg(''); } 
    catch (e) { console.error(e); } finally { setIsSendingTicker(false); }
  };
  const limpiarTicker = async () => {
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

  return (
    <div className="h-screen bg-zinc-950 flex flex-col text-white font-sans overflow-hidden">
      {/* Cabecera */}
      <header className="h-16 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between px-3 sm:px-6 shrink-0 shadow-sm z-10">
        <div className="flex items-center gap-2 sm:gap-4 min-w-0">
            <button onClick={() => navigate(`/setlist/${eventoId}`)} className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors shrink-0">
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
          <div className="flex items-center gap-2">
            <button onClick={botonPanico} className="p-2.5 bg-red-600 text-white rounded-xl shadow-lg active:scale-90 transition-transform"><Zap size={18}/></button>
            <button onClick={() => setShowMobileControlsModal(true)} className="p-2.5 bg-violet-600 text-white rounded-xl shadow-lg active:scale-90 transition-transform"><Settings2 size={18}/></button>
          </div>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <button 
            onClick={() => setShowEventList(!showEventList)}
            className="flex items-center gap-2 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-xs font-bold transition-all border border-zinc-700"
          >
            <Layers size={14} className="text-blue-400"/>
            <span className="hidden lg:inline">Cambiar Evento</span>
          </button>
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
            className="md:hidden p-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg shadow-md transition-all active:scale-95"
            title="Controles"
          >
            <Settings2 size={20} />
          </button>
        </div>
      </header>

      {/* VISTA PC: 3 Columnas (Se oculta en móviles) */}
      <div className="hidden md:flex flex-1 overflow-hidden">
        {/* Columna Izquierda: Setlist */}
        <div className="w-1/4 min-w-[250px] bg-zinc-900/50 border-r border-zinc-800 flex flex-col">
          <div className="p-4 border-b border-zinc-800 bg-zinc-900">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={14} />
              <input 
                type="text"
                value={songSearchTerm}
                onChange={(e) => setSongSearchTerm(e.target.value)}
                placeholder="Buscar canción global..."
                className="w-full bg-zinc-950 border border-zinc-700 rounded-xl pl-9 pr-4 py-2 text-xs focus:border-violet-500 outline-none transition-all"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-1 [&::-webkit-scrollbar]:hidden">
            {songSearchTerm.trim() !== '' ? (
              <div className="space-y-2 animate-in fade-in duration-200">
                <p className="text-[10px] font-black text-violet-400 uppercase tracking-widest px-1 flex justify-between">
                  Resultados Globales {isSearchingGlobal && <Loader2 size={10} className="animate-spin"/>}
                </p>
                {globalSearchResults.map(song => (
                  <button 
                    key={song.id}
                    onClick={() => agregarCancionAlSetlist(song)}
                    className="w-full text-left p-3 rounded-xl bg-violet-600/10 border border-violet-500/30 hover:bg-violet-600/20 transition-all group flex justify-between items-center"
                  >
                    <div className="min-w-0">
                      <p className="font-bold text-xs truncate text-white">{song.titulo}</p>
                      <p className="text-[10px] text-zinc-500 truncate">{song.artista}</p>
                    </div>
                    <Plus size={14} className="text-violet-400 group-hover:scale-125 transition-transform" />
                  </button>
                ))}
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
              const setlistItems = evento?.setlist || (evento?.canciones || []).map(id => ({ type: 'song', value: id, idLocal: id }));
              return setlistItems.filter(i => i.type === 'song').map((item, idx) => {
                const c = canciones.find(c => c.id === item.value);
                if (!c) return null;
                return (
                  <button 
                    key={c.id} 
                    onClick={async () => { 
                      setActiveSongId(c.id); 
                      setPreviewSlide(null); 
                      if (c.fondoUrl) {
                        try { await setDoc(doc(db, 'eventos', eventoId), { proyectorFondo: c.fondoUrl }, { merge: true }); } catch(e) { console.error(e); }
                      }
                    }}
                    className={`w-full text-left p-3 rounded-xl transition-all border ${activeSongId === c.id ? 'bg-violet-600/10 border-violet-500/50 text-white shadow-sm' : 'border-transparent hover:bg-zinc-800/50 text-zinc-400 hover:text-zinc-200'}`}
                  >
                    <p className="font-bold text-sm truncate">{idx + 1}. {c.titulo}</p>
                    <p className="text-xs opacity-70 truncate">{c.artista}</p>
                  </button>
                );
              });
            })()}
          </div>
        </div>

        {/* Columna Central: Diapositivas */}
        <div className="flex-1 bg-zinc-950 flex flex-col border-r border-zinc-800">
          <div className="p-4 border-b border-zinc-800 bg-zinc-900 flex justify-between items-center">
            <h2 className="font-bold text-sm flex items-center gap-2"><Type size={16} className="text-amber-500"/> Diapositivas {activeSong && <span className="text-zinc-500">- {activeSong.titulo}</span>}</h2>
          </div>
          <div className="flex-1 flex flex-col overflow-hidden">
            
            {/* 📺 NUEVO: PANEL DE MULTIMEDIA RÁPIDA (Bóveda) */}
            <div className="bg-zinc-900/50 border-b border-zinc-800 p-4">
              <div className="flex justify-between items-center mb-3">
                <div className="flex items-center gap-2">
                  <div className="relative mr-2">
                    <input 
                      type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                      placeholder="Buscar en bóveda..."
                      className="bg-zinc-950 border border-zinc-700 rounded-lg px-2 py-1 text-[10px] w-32 focus:border-indigo-500 outline-none transition-all"
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
                      <div className="w-24 h-16 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center group-hover:bg-amber-500/20 transition-all">
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
                      onClick={() => { setPreviewMedia({ url: m.url, type: m.type, mode: 'foreground', name: m.name }); setPreviewSlide(null); }}
                      className={`w-24 h-16 rounded-lg overflow-hidden border transition-all bg-black relative ${previewMedia?.url === m.url ? 'border-indigo-500 ring-2 ring-indigo-500/30' : 'border-zinc-700 hover:border-indigo-400'}`}
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

            {/* 🎛️ CONSOLA DE MEDIOS (Control de reproducción) */}
            {mediaActive && mediaActive.type === 'video' && (
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

            <div className="flex-1 flex flex-col p-4 bg-zinc-950/50 overflow-hidden">
            {!activeSong ? (
              <div className="h-full flex items-center justify-center text-zinc-600 font-medium">Selecciona una canción del setlist</div>
            ) : (
              <>
              <div className="flex gap-2 mb-4 shrink-0">
                <button 
                  onClick={() => projectSlide({ titulo: 'Instrumental', texto: ' ' })}
                  className="flex-1 py-3 bg-zinc-800/80 hover:bg-zinc-700 border border-zinc-700 rounded-2xl flex items-center justify-center gap-2 font-bold text-zinc-300 transition-colors shadow-sm active:scale-95"
                >
                  <Eraser size={18} className="text-zinc-400"/> Limpiar Texto
                </button>
                <button 
                  onClick={toggleLogo}
                  className={`flex-1 py-3 rounded-2xl flex items-center justify-center gap-2 font-bold transition-colors shadow-sm active:scale-95 ${isLogoActive ? 'bg-amber-600 border border-amber-500 text-white animate-pulse shadow-[0_0_15px_rgba(217,119,6,0.4)]' : 'bg-zinc-800/80 hover:bg-zinc-700 border border-zinc-700 text-zinc-300'}`}
                >
                  <Star size={18} className={isLogoActive ? "text-amber-100" : "text-amber-500"}/> {isLogoActive ? 'Quitar Logo' : 'Mostrar Logo'}
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden grid grid-cols-2 lg:grid-cols-3 gap-4 pb-20">
                {slides.map((s, idx) => (
                  <div 
                    key={s.titulo + idx} // Usar una key más robusta
                    onClick={() => { setPreviewSlide(s); setPreviewMedia(null); }} // Al tocar una letra, quitamos el video de "Pre"
                    onDoubleClick={() => projectSlide(s)}
                    className={`relative cursor-pointer border rounded-2xl overflow-hidden flex flex-col h-36 transition-all transform active:scale-95 ${previewSlide?.texto === s.texto ? 'border-violet-500 ring-2 ring-violet-500/30' : 'border-zinc-700 hover:border-zinc-500'} ${liveSlide?.texto === s.texto && !isBlackout ? 'bg-zinc-800 shadow-[0_0_15px_rgba(139,92,246,0.15)]' : 'bg-zinc-900'}`}
                  >
                    <div className="px-3 py-2 bg-zinc-950/80 border-b border-zinc-800 flex justify-between items-center shrink-0">
                      <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">{s.titulo}</span>
                      {liveSlide?.texto === s.texto && !isBlackout && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shadow-[0_0_5px_rgba(239,68,68,0.8)]" title="En vivo"></span>}
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
              <button onClick={projectNextSlide} className="fixed bottom-32 right-1/3 mr-8 p-6 bg-orange-600 hover:bg-orange-500 text-white rounded-full shadow-2xl z-20 hover:scale-110 active:scale-95 transition-all flex items-center justify-center border-4 border-white/20">
                <ChevronRight size={40} />
              </button>
              </>
            )}
          </div>
          </div> 
        </div> 

        {/* Columna Derecha: Vista Previa y En Vivo */}
        <div className="w-1/3 min-w-[320px] bg-zinc-900/30 flex flex-col">
          
          {/* Pre-visualización */}
          <div className="flex-1 border-b border-zinc-800 flex flex-col">
            <div className="p-3 border-b border-zinc-800 bg-zinc-900/80">
              <h2 className="font-bold text-sm flex items-center gap-2 text-zinc-400"><Eye size={16}/> Pre-proyección</h2>
            </div>
            <div className="flex-1 p-5 flex flex-col">
              <div className="flex-1 bg-black rounded-3xl border-2 border-zinc-700 shadow-inner flex items-center justify-center p-6 text-center overflow-hidden relative">
                {previewMedia ? (
                  <>
                    {previewMedia.type === 'video' ? (
                      <video src={previewMedia.url} controls muted playsInline className="absolute inset-0 z-0 w-full h-full object-contain bg-zinc-900" />
                    ) : (
                      <img src={previewMedia.url} className="absolute inset-0 z-0 w-full h-full object-contain bg-zinc-900" />
                    )}
                    <button onClick={() => setPreviewMedia(null)} className="absolute top-4 right-4 p-2 bg-red-600/80 hover:bg-red-600 rounded-full text-white shadow-xl z-20 transition-all"><X size={18}/></button>
                  </>
                ) : previewSlide ? (
                  <>
                    {fondoActivo && (fondoActivo.match(/\.(mp4|webm|mov)$/i) || fondoActivo.includes('video/upload')) ? (
                      <video src={fondoActivo} autoPlay loop muted playsInline className="absolute inset-0 w-full h-full object-cover opacity-40 z-0 pointer-events-none" />
                    ) : fondoActivo && (
                      <img src={fondoActivo} className="absolute inset-0 w-full h-full object-cover opacity-40 z-0 pointer-events-none" />
                    )}
                    <p className="relative z-10 text-[0.65rem] sm:text-[0.75rem] font-black text-white leading-tight whitespace-pre-wrap drop-shadow-lg">
                      {previewSlide.texto.trim() === '' ? <span className="text-white/30 italic font-medium">🎶 Instrumental</span> : previewSlide.texto}
                    </p>
                  </>
                ) : (
                  <p className="text-zinc-700 font-bold uppercase tracking-widest text-xs">Sin Selección</p>
                )}
              </div>
              <button 
                onClick={() => previewMedia ? projectMedia(previewMedia) : projectSlide(previewSlide)} 
                disabled={!previewSlide && !previewMedia}
                className="mt-4 py-3.5 bg-violet-600 hover:bg-violet-500 text-white rounded-xl font-black text-sm uppercase tracking-wide flex items-center justify-center gap-2 disabled:opacity-50 transition-all active:scale-95 shadow-lg shadow-violet-900/20"
              >
                <Monitor size={18} /> {previewMedia ? 'Proyectar Contenido' : 'Proyectar Diapositiva'}
              </button>
            </div>
          </div>

          {/* En Vivo */}
          <div className="flex-1 flex flex-col">
            <div className="p-3 border-b border-zinc-800 bg-zinc-900/80 flex justify-between items-center">
              <h2 className="font-bold text-sm flex items-center gap-2 text-red-500"><Play size={16}/> En Vivo</h2>
              
              {/* ⏱️ CONTROL DE RELOJ (Countdown) SIEMPRE VISIBLE */}
              <div className="flex items-center gap-2 bg-zinc-950 p-1 rounded-lg border border-zinc-800 scale-90">
                <input type="number" value={countdownMinutes} onChange={e => setCountdownMinutes(parseInt(e.target.value))} className="w-8 bg-transparent text-center font-bold text-xs outline-none text-violet-400" />
                <button onClick={() => toggleCountdown(!(evento?.proyectorCountdown?.active))} className={`px-2 py-1 rounded text-[8px] font-black uppercase transition-all ${evento?.proyectorCountdown?.active ? 'bg-red-600 text-white' : 'bg-zinc-800 text-zinc-500 hover:text-white'}`}>
                  {evento?.proyectorCountdown?.active ? 'PARAR' : 'RELOJ'}
                </button>
              </div>

              {isBlackout && <span className="text-[10px] bg-red-600 px-2 py-0.5 rounded-full font-bold uppercase tracking-widest">Apagado</span>}
            </div>
            <div className="flex-1 p-5">
              <div className={`relative w-full h-full rounded-2xl border-2 shadow-[0_0_30px_rgba(0,0,0,0.5)] flex flex-col p-6 overflow-hidden transition-colors ${isBlackout ? 'border-red-900/50 bg-black items-center justify-center' : modoTransmision ? 'border-emerald-500 bg-[#00FF00] items-start justify-end pb-8' : 'border-red-600 bg-black items-center justify-center text-center'}`}>
                {isBlackout ? (
                   <p className="relative z-10 text-red-900/50 font-black uppercase tracking-widest">Pantalla en Negro</p>
                ) : displayLiveSlide ? (
                  <> {/* LETRAS EN VIVO */}
                    {!modoTransmision && fondoActivo && (fondoActivo.match(/\.(mp4|webm|mov)$/i) || fondoActivo.includes('video/upload')) ? (
                      <video src={fondoActivo} autoPlay loop muted playsInline className="absolute inset-0 w-full h-full object-cover opacity-40 z-0 pointer-events-none" />
                    ) : !modoTransmision && fondoActivo && (
                      <img src={fondoActivo} className="absolute inset-0 w-full h-full object-cover opacity-40 z-0 pointer-events-none" />
                    )}
                    <p className={`relative z-10 font-black text-white whitespace-pre-wrap ${animationClass} ${modoTransmision ? 'text-[0.5rem] text-left bg-black/80 border-l-[4px] border-violet-600 py-2 pr-3 pl-2 rounded-r-lg shadow-xl max-w-[90%]' : 'text-[0.65rem] sm:text-[0.75rem] leading-tight drop-shadow-lg'}`}>
                      {displayLiveSlide.texto.trim() === '' ? <span className="text-white/30 italic font-medium">🎶 Instrumental</span> : displayLiveSlide.texto}
                    </p>
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
          <div className="border-t border-zinc-800 bg-zinc-900 p-4 shrink-0 flex flex-col gap-4 shadow-[0_-10px_20px_rgba(0,0,0,0.3)] z-10 relative overflow-y-auto max-h-[35vh]">
            
            {/* 📺 NUEVO: Matriz de Salidas (Quick Access) */}
            <div className="flex flex-col gap-2">
              <div className="flex justify-between items-center">
                <h2 className="font-bold text-xs flex items-center gap-1.5 text-violet-400 uppercase tracking-widest"><Tv size={14}/> Matriz de Salidas</h2>
                <button onClick={() => setShowOutputsModal(true)} className="text-[10px] font-bold text-zinc-500 hover:text-white transition-colors">Configurar</button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(outputs).map(([id, out]) => (
                  <button 
                    key={id}
                    onClick={() => lanzarSalidaGlobal(id)}
                    className="flex flex-col p-2 bg-zinc-950 border border-zinc-800 rounded-xl hover:border-violet-500 transition-all text-left group"
                  >
                    <span className="text-[9px] font-black text-zinc-500 uppercase truncate group-hover:text-violet-400 transition-colors">{out.label}</span>
                    <span className="text-[10px] font-bold text-zinc-300 truncate">{out.type === 'proyector' ? 'Público' : out.type === 'retorno' ? 'Stage' : 'Banda'}</span>
                  </button>
                ))}
                {Object.keys(outputs).length === 0 && <p className="col-span-2 text-[10px] text-zinc-600 italic text-center py-2">Configura tus pantallas en la Central Multimedia</p>}
              </div>
            </div>

            {/* Retorno a Tarima */}
            <div className="flex flex-col gap-2">
              <div className="flex justify-between items-center">
                 <h2 className="font-bold text-xs flex items-center gap-1.5 text-amber-500 uppercase tracking-widest"><AlertCircle size={14}/> Retorno a Tarima</h2>
                 <div className="flex gap-2">
                   <button onClick={() => handleOpenScreen(`/retorno/${eventoId}`)} className="text-zinc-400 border border-zinc-700 hover:bg-zinc-800 text-[10px] px-2 py-1 rounded font-bold transition-colors">Cantantes</button>
                   <button onClick={() => handleOpenScreen(`/retorno-musicos/${eventoId}`)} className="text-emerald-400 border border-emerald-900/50 hover:bg-emerald-900/20 text-[10px] px-2 py-1 rounded font-bold transition-colors">Músicos</button>
                 </div>
              </div>
              <div className="flex gap-2">
                <input type="text" value={alertaTarima} onChange={e => setAlertaTarima(e.target.value)} placeholder="Solo músicos..." className="flex-1 bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:border-amber-500 outline-none text-white placeholder:text-zinc-600 transition-all" onKeyPress={e => e.key === 'Enter' && enviarAlerta()} />
                <button onClick={enviarAlerta} disabled={isSendingAlert || !alertaTarima.trim()} className="bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white px-3 py-2 rounded-lg font-bold transition-all"><Send size={16}/></button>
              </div>
              {evento?.proyectorAlerta && (
                <div className="flex items-center justify-between bg-red-600/20 border border-red-500 p-2 rounded-lg">
                  <span className="text-[10px] text-red-100 font-bold truncate">Alerta: {evento.proyectorAlerta}</span>
                  <button onClick={limpiarAlerta} className="text-white hover:bg-red-500 text-[10px] font-bold uppercase bg-red-600 px-2 py-1 rounded transition-colors shrink-0">Ocultar</button>
                </div>
              )}
            </div>
            
            {/* Marquesina Pública */}
            <div className="flex flex-col gap-2 pt-3 border-t border-zinc-800">
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
      <div className="md:hidden flex-1 flex flex-col bg-zinc-950 overflow-hidden relative">
        {/* Barra de Setlist Horizontal */}
        <div className="bg-zinc-900 border-b border-zinc-800 p-3 overflow-x-auto whitespace-nowrap flex gap-2 shrink-0 [&::-webkit-scrollbar]:hidden">
          {(() => {
            const setlistItems = evento?.setlist || (evento?.canciones || []).map(id => ({ type: 'song', value: id, idLocal: id }));
            return setlistItems.filter(i => i.type === 'song').map((item, idx) => {
              const c = canciones.find(c => c.id === item.value);
              if (!c) return null;
              return (
                <button 
                  key={idx} 
                  onClick={async () => { 
                    setActiveSongId(c.id); 
                    if (c.fondoUrl) {
                      try { await setDoc(doc(db, 'eventos', eventoId), { proyectorFondo: c.fondoUrl }, { merge: true }); } catch(e) { console.error(e); }
                    }
                  }}
                  className={`inline-flex items-center px-4 py-2 rounded-xl text-sm font-bold transition-all border shadow-sm ${activeSongId === c.id ? 'bg-violet-600 text-white border-violet-500' : 'bg-zinc-800 text-zinc-400 border-zinc-700'}`}
                >
                  {idx + 1}. {c.titulo}
                </button>
              );
            });
          })()}
        </div>

        {/* Grid de Diapositivas (1 solo toque proyecta) */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 pb-40">
          {!activeSong ? (
            <div className="h-full flex items-center justify-center text-zinc-600 font-medium text-sm text-center px-4">Desliza la barra superior y selecciona una canción para proyectar</div>
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
                    onClick={() => { projectSlide(s); setPreviewMedia(null); }} // En móvil, proyectar letra limpia el video
                    className={`relative cursor-pointer border rounded-2xl overflow-hidden flex flex-col h-32 transition-all transform active:scale-95 
                      ${evento?.proyectorSlideIndex === idx && !isBlackout ? 'border-violet-500 ring-2 ring-violet-500/50 bg-zinc-800 shadow-[0_0_15px_rgba(139,92,246,0.15)]' : 'border-zinc-800 bg-zinc-900'}
                      ${evento?.proyectorSlideIndex !== undefined && evento.proyectorSlideIndex + 1 === idx ? 'border-orange-500/60 border-2 dashed' : ''}`}
                  >
                    <div className="px-2 py-1.5 bg-zinc-950/80 border-b border-zinc-800 flex justify-between items-center shrink-0">
                      <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">{s.titulo}</span>
                      {liveSlide?.texto === s.texto && !isBlackout && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shadow-[0_0_5px_rgba(239,68,68,0.8)]"></span>}
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

        {/* Barra Flotante Inferior de Estado (Móvil) */}
        <div className="absolute bottom-0 left-0 w-full bg-zinc-950 border-t border-zinc-800 p-4 flex items-center gap-3 z-20 pb-6 shadow-[0_-10px_30px_rgba(0,0,0,0.5)]">
           <div className={`w-3 h-3 rounded-full shrink-0 ${isBlackout ? 'bg-zinc-600' : 'bg-red-500 animate-pulse'}`}></div>
           <div className="flex-1 truncate">
             <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mb-0.5">En Pantalla</p>
             <p className="text-xs font-bold text-white truncate">
               {isBlackout ? 'Pantalla en negro (Apagada)' : (liveSlide?.texto?.trim() ? liveSlide.texto.replace(/\n/g, ' - ') : '🎶 Instrumental (Solo fondo)')}
             </p>
           </div>
        </div>
      </div>

      {/* 📱 MODAL: PANEL DE CONTROL MÓVIL (Bóveda + Cronómetro) */}
      {showMobileControlsModal && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-xl flex flex-col z-[200] p-4 animate-in fade-in duration-300">
          <div className="bg-zinc-900 border border-zinc-800 rounded-[2.5rem] w-full max-w-lg mx-auto shadow-2xl flex flex-col overflow-hidden flex-1">
            <div className="p-6 border-b border-zinc-800 bg-zinc-900/50 flex justify-between items-center shrink-0">
              <h3 className="text-xl font-black text-white flex items-center gap-3">
                <Settings2 className="text-violet-500" size={24} /> Controles Móviles
              </h3>
              <button onClick={() => setShowMobileControlsModal(false)} className="p-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 rounded-2xl transition-colors"><X size={20}/></button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-zinc-800 shrink-0">
              <button onClick={() => setMobileActiveTab('media')} className={`flex-1 py-4 text-xs font-black uppercase tracking-widest border-b-2 transition-colors ${mobileActiveTab === 'media' ? 'border-violet-500 text-white bg-violet-500/5' : 'border-transparent text-zinc-500'}`}>Bóveda</button>
              <button onClick={() => setMobileActiveTab('liveControls')} className={`flex-1 py-4 text-xs font-black uppercase tracking-widest border-b-2 transition-colors ${mobileActiveTab === 'liveControls' ? 'border-amber-500 text-white bg-amber-500/5' : 'border-transparent text-zinc-500'}`}>En Vivo</button>
            </div>

            {mobileActiveTab === 'media' ? (
              <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 [&::-webkit-scrollbar]:hidden">
                <div className="flex items-center gap-2 bg-zinc-950 p-2 rounded-2xl border border-zinc-800">
                  <Search size={16} className="text-zinc-500 ml-2" />
                  <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Buscar en la bóveda..." className="flex-1 bg-transparent border-none text-sm outline-none focus:ring-0" />
                  {currentFolder && <button onClick={() => setCurrentFolder(null)} className="p-2 bg-zinc-800 rounded-xl text-white"><ChevronLeft size={16}/></button>}
                </div>

                <div className="grid grid-cols-2 gap-3 pb-24">
                  {!currentFolder && multimediaFolders.filter(f => f.toLowerCase().includes(searchTerm.toLowerCase())).map((folder, i) => (
                    <button key={i} onClick={() => setCurrentFolder(folder)} className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-4 flex flex-col items-center gap-2">
                      <Folder size={32} className="text-amber-500" fill="currentColor" fillOpacity={0.2}/>
                      <span className="text-[10px] font-black uppercase text-zinc-400 truncate w-full text-center">{folder}</span>
                    </button>
                  ))}
                  {filteredMedia.map((m, i) => (
                    <button key={i} onClick={() => setPreviewMedia({ url: m.url, type: m.type, mode: 'foreground', name: m.name })} className={`relative aspect-video rounded-2xl overflow-hidden border-2 transition-all ${previewMedia?.url === m.url ? 'border-violet-500 scale-95' : 'border-zinc-800'}`}>
                      {m.type === 'video' ? <video src={m.url} className="w-full h-full object-cover opacity-60" /> : <img src={m.url} className="w-full h-full object-cover opacity-60" />}
                      <div className="absolute bottom-0 inset-x-0 bg-black/60 p-1"><p className="text-[8px] font-bold text-white truncate text-center">{m.name}</p></div>
                    </button>
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
            ) : (
              <div className="flex-1 overflow-y-auto p-6 space-y-8">
                 <div className="grid grid-cols-2 gap-4">
                    <button onClick={toggleBlackout} className={`p-6 rounded-[2rem] border-2 flex flex-col items-center gap-2 ${isBlackout ? 'bg-red-600 border-red-400' : 'bg-zinc-800 border-zinc-700 text-zinc-400'}`}><PowerOff size={28}/> <span className="text-[10px] font-black uppercase">Apagar</span></button>
                    <button onClick={toggleLogo} className={`p-6 rounded-[2rem] border-2 flex flex-col items-center gap-2 ${isLogoActive ? 'bg-amber-600 border-amber-400' : 'bg-zinc-800 border-zinc-700 text-zinc-400'}`}><Star size={28}/> <span className="text-[10px] font-black uppercase">Logo</span></button>
                 </div>
                 <div className="bg-zinc-950 p-6 rounded-[2.5rem] border border-zinc-800">
                    <h4 className="text-xs font-black text-violet-400 uppercase mb-4 flex items-center gap-2"><Clock size={16}/> Cronómetro</h4>
                    <div className="flex items-center gap-4">
                      <input type="number" value={countdownMinutes} onChange={e => setCountdownMinutes(e.target.value)} className="w-24 bg-zinc-900 border border-zinc-700 rounded-2xl py-3 text-center text-xl font-black text-white" />
                      <button onClick={() => toggleCountdown(true)} className="flex-1 py-4 bg-emerald-600 text-white rounded-2xl font-black text-xs active:scale-95 shadow-lg shadow-emerald-900/20">INICIAR</button>
                      <button onClick={() => toggleCountdown(false)} className="p-4 bg-zinc-800 text-zinc-500 rounded-2xl"><X size={20}/></button>
                    </div>
                 </div>
              </div>
            )}
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
                <p className="text-xs text-zinc-400 mb-4">Sube un video MP4 (Motion Background) o una imagen JPG/PNG. Se almacenará de forma óptima en <b>Cloudinary</b>.</p>
                
                <label className={`w-full py-4 rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-2 transition-colors cursor-pointer ${isUploadingFondo ? 'border-indigo-500/50 bg-indigo-500/10' : 'border-zinc-700 bg-zinc-800/50 hover:bg-zinc-800 hover:border-indigo-500'}`}>
                  {isUploadingFondo ? <Loader2 size={24} className="text-indigo-500 animate-spin" /> : <Upload size={24} className="text-zinc-400" />}
                  <span className="text-sm font-bold text-zinc-300">{isUploadingFondo ? 'Subiendo archivo...' : 'Seleccionar Archivo'}</span>
                  <input type="file" accept="video/mp4, video/webm, image/jpeg, image/png" className="hidden" disabled={isUploadingFondo} onChange={handleUploadCloudinary} />
                </label>
              </div>

              {activeSongId && (
                <label className="flex items-center gap-3 p-3 bg-zinc-800/50 rounded-xl cursor-pointer border border-zinc-700/50 hover:bg-zinc-800 transition-colors">
                  <input type="checkbox" checked={guardarEnCancion} onChange={e => setGuardarEnCancion(e.target.checked)} className="w-5 h-5 rounded text-indigo-500 focus:ring-indigo-500 bg-zinc-900 border-zinc-700" />
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-white leading-none mb-1">Guardar en la canción</span>
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


      {/* 🚀 MODAL DE CONFIRMACIÓN (Borrar) */}
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
                          {['proyector', 'retorno', 'musicos'].map(t => (
                            <button 
                              key={t} onClick={() => handleUpdateOutput(id, { type: t })}
                              className={`px-2 py-1 rounded-md text-[9px] font-black uppercase border ${out.type === t ? 'bg-violet-600 border-violet-500 text-white' : 'border-zinc-800 text-zinc-600'}`}
                            >
                              {t === 'proyector' ? 'Público' : t === 'retorno' ? 'Stage' : 'Banda'}
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

    </div>
  );
};
export default ProyectorController;