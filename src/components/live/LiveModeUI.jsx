// src/components/live/LiveModeUI.jsx
import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { doc, getDoc, setDoc, updateDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { calcularOffsetSemitonos, transponerNota, traducirAcorde } from '../../utils/musicCore';
import { parsearCancion } from '../../utils/songParser';
import { Play, Pause, SkipBack, SkipForward, Volume2, Volume1, VolumeX, FileText, X, Save, Activity, Maximize, Minimize, Library, Video, ExternalLink, SlidersHorizontal, Headphones, Square, Crown } from 'lucide-react';

const LiveModeUI = ({ user, esGuitarrista, preferences }) => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const eventoId = searchParams.get('evento'); // Mensaje oculto en la URL
  const cantanteQuery = searchParams.get('cantante'); // Cantante asignado
  const returnPath = eventoId ? `/setlist/${eventoId}` : '/canciones';
  
  const [cancion, setCancion] = useState(null);
  const [evento, setEvento] = useState(null);
  const [loading, setLoading] = useState(true);
  const [wakeLock, setWakeLock] = useState(null);
  const [pulse, setPulse] = useState(false);
  const [semitonosOffset, setSemitonosOffset] = useState(0); // Controla la transposición actual
  const [fontSize, setFontSize] = useState(preferences.fontSize || 16);
  const [isAutoScrolling, setIsAutoScrolling] = useState(false);
  const scrollRef = useRef(null);
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [nota, setNota] = useState('');
  const [showNotes, setShowNotes] = useState(false);
  const [savingNota, setSavingNota] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showRecursos, setShowRecursos] = useState(false);
  const [showMixer, setShowMixer] = useState(false);
  const [activeTab, setActiveTab] = useState('General');
  
  // Estados para Multitracks / Mezcladora
  const [trackVolumes, setTrackVolumes] = useState({});
  const [trackMutes, setTrackMutes] = useState({});
  const [trackPans, setTrackPans] = useState({});
  const [splitMode, setSplitMode] = useState(false);
  const multitrackRefs = useRef({});
  const pannerNodesRef = useRef({});

  const audioCtxRef = useRef(null);
  const clickEnabledRef = useRef(false);
  const [clickActive, setClickActive] = useState(false);

  useEffect(() => {
    const fetchSong = async () => {
      try {
        const docRef = doc(db, 'canciones', id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setCancion(data);

          // AUTO-TRANSPOSICIÓN MAGISTRAL
          if (cantanteQuery && data.tonosAlternativos) {
            const opciones = data.tonosAlternativos.split(',');
            const opcionMatch = opciones.find(opt => opt.trim().toLowerCase().startsWith(cantanteQuery.toLowerCase() + ':'));
            if (opcionMatch) {
              const tonoDestino = opcionMatch.split(':')[1].trim();
              setSemitonosOffset(calcularOffsetSemitonos(data.tonoOriginal, tonoDestino));
            }
          }
        } else {
          alert("La canción no existe");
          navigate(returnPath);
        }
      } catch (error) {
        console.error("Error al cargar la canción para Live Mode:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchSong();

    // Si venimos de un evento, descargar la lista completa
    let unsubEvento;
    if (eventoId) {
      unsubEvento = onSnapshot(doc(db, 'eventos', eventoId), (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setEvento(data);
          
          // Lógica de seguidor (Follower)
          if (data.directorId && data.directorId !== user?.uid) {
            if (data.currentSongId && data.currentSongId !== id) {
               navigate(`/live/${data.currentSongId}?evento=${eventoId}`);
            }
            if (data.directorAutoScroll !== undefined) {
               setIsAutoScrolling(data.directorAutoScroll);
            }
            // Scroll sincronizado (tolerancia mayor si el auto-scroll nativo está trabajando)
            const umbralTolerancia = data.directorAutoScroll ? 300 : 50;
            if (data.scrollY !== undefined && Math.abs(window.scrollY - data.scrollY) > umbralTolerancia) {
               window.scrollTo({ top: data.scrollY, behavior: 'smooth' });
            }
          }
        }
      });
    }

    // Cargar la nota personal del usuario para esta canción
    if (user?.uid && id) {
      const fetchNota = async () => {
        const notaSnap = await getDoc(doc(db, 'usuarios', user.uid, 'notas', id));
        if (notaSnap.exists()) {
          setNota(notaSnap.data().texto || '');
        }
      };
      fetchNota();
    }

    // Reiniciar reproductor al cambiar de canción
    setIsPlaying(false);
    setCurrentTime(0);

    // Listener para detectar cambios en fullscreen (por si el usuario sale con la tecla ESC)
    const handleFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, [id, navigate]);
  
  // 1. Wake Lock API: Evitar que se apague la pantalla
  useEffect(() => {
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          const lock = await navigator.wakeLock.request('screen');
          setWakeLock(lock);
        }
      } catch (err) {
        console.error("Wake Lock API error:", err);
      }
    };
    requestWakeLock();
    return () => wakeLock && wakeLock.release();
  }, []);

  // 2. Metrónomo Visual (BPM)
  useEffect(() => {
    if (!cancion || !cancion.bpm) return;
    const intervalMs = 60000 / cancion.bpm;
    let beatCount = 0; // Para saber cuál es el primer golpe de 4
    
    const interval = setInterval(() => {
      setPulse(true);
      setTimeout(() => setPulse(false), 100); // Destello rápido
      
      if (clickEnabledRef.current) {
        playClick(beatCount === 0);
        beatCount = (beatCount + 1) % 4; // Asumimos compás de 4/4
      }
    }, intervalMs);

    return () => clearInterval(interval);
  }, [cancion?.bpm]);

  // 3. Lógica de Auto-Scroll (Ahora ultra-fluido a 60fps con requestAnimationFrame)
  const toggleAutoScroll = () => {
    const newState = !isAutoScrolling;
    setIsAutoScrolling(newState);
    if (eventoId && evento?.directorId === user?.uid) {
      updateDoc(doc(db, 'eventos', eventoId), { directorAutoScroll: newState }).catch(e => console.error(e));
    }
  };

  useEffect(() => {
    let animationFrameId;
    if (isAutoScrolling) {
      const scrollStep = () => {
        if (scrollRef.current) scrollRef.current.scrollTop += 0.7; // Ajuste de velocidad (0.7px por frame)
        window.scrollBy(0, 0.7);
        animationFrameId = requestAnimationFrame(scrollStep);
      };
      animationFrameId = requestAnimationFrame(scrollStep);
    }
    return () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
    };
  }, [isAutoScrolling]);

  // Inicializar volumen y paneo de Multitracks cuando carguen
  useEffect(() => {
    if (cancion?.multitracks?.length > 0) {
      const initialVols = {};
      const initialMutes = {};
      const initialPans = {};
      cancion.multitracks.forEach(m => {
        initialVols[m.id] = 1; // Volumen al 100%
        initialMutes[m.id] = false;
        initialPans[m.id] = 0; // Paneo al centro por defecto
      });
      setTrackVolumes(initialVols);
      setTrackMutes(initialMutes);
      setTrackPans(initialPans);
    }
  }, [cancion?.multitracks]);

  // Cálculos para navegación del Setlist (Extraídos arriba para usarlos en el teclado)
  let currentIndex = -1, prevSongId = null, nextSongId = null;
  if (evento && evento.canciones) {
    currentIndex = evento.canciones.indexOf(id);
    if (currentIndex > 0) prevSongId = evento.canciones[currentIndex - 1];
    if (currentIndex < evento.canciones.length - 1) nextSongId = evento.canciones[currentIndex + 1];
  }

  // 5. Soporte para Pedales Bluetooth / Flechas del Teclado
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignorar si el usuario está escribiendo en el bloc de notas
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      switch (e.key) {
        case 'ArrowRight':
        case 'PageDown':
          e.preventDefault();
          if (nextSongId) goToSong(nextSongId);
          break;
        case 'ArrowLeft':
        case 'PageUp':
          e.preventDefault();
          if (prevSongId) goToSong(prevSongId);
          break;
        case 'ArrowDown':
          e.preventDefault();
          if (scrollRef.current) scrollRef.current.scrollBy({ top: window.innerHeight / 3, behavior: 'smooth' });
          else window.scrollBy({ top: window.innerHeight / 3, behavior: 'smooth' });
          break;
        case 'ArrowUp':
          e.preventDefault();
          if (scrollRef.current) scrollRef.current.scrollBy({ top: -window.innerHeight / 3, behavior: 'smooth' });
          else window.scrollBy({ top: -window.innerHeight / 3, behavior: 'smooth' });
          break;
        case ' ': // Barra Espaciadora (Muchos pedales la usan para iniciar/detener)
          e.preventDefault();
          toggleAutoScroll();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [nextSongId, prevSongId, eventoId, isAutoScrolling]);

  // MODO DIRECTOR: Sincronizar Scroll maestro a los demás
  useEffect(() => {
    if (!eventoId || evento?.directorId !== user?.uid) return;
    let timeout;
    const handleScroll = () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        updateDoc(doc(db, 'eventos', eventoId), { scrollY: window.scrollY }).catch(e => console.error(e));
      }, 150); // Reducido de 400ms a 150ms para mayor fluidez
    };
    window.addEventListener('scroll', handleScroll);
    return () => { window.removeEventListener('scroll', handleScroll); clearTimeout(timeout); };
  }, [eventoId, evento?.directorId, user?.uid]);

  const takeControl = async () => {
    if (!eventoId) return;
    const isTaking = evento?.directorId !== user?.uid;
    try { await updateDoc(doc(db, 'eventos', eventoId), { directorId: isTaking ? user.uid : null, currentSongId: isTaking ? id : null, scrollY: isTaking ? window.scrollY : 0, directorAutoScroll: isTaking ? isAutoScrolling : false }); } catch (e) { console.error(e); }
  };

  // 4. Lógica de Fullscreen
  const toggleFullscreen = async () => {
    if (!document.fullscreenElement) {
      try {
        await document.documentElement.requestFullscreen();
      } catch (err) {
        console.error("Error al activar fullscreen:", err);
      }
    } else {
      if (document.exitFullscreen) await document.exitFullscreen();
    }
  };

  if (loading) {
    return <div className="min-h-screen bg-zinc-950 flex justify-center items-center text-zinc-500 font-bold animate-pulse">Cargando Teleprompter...</div>;
  }
  if (!cancion) return null;

  const seccionesParsed = parsearCancion(cancion.letraRaw);

  const goToSong = (targetId) => {
    setIsAutoScrolling(false); // Detener el scroll
    setSemitonosOffset(0); // Reiniciar capotraste
    
    if (eventoId && evento?.directorId === user?.uid) {
       updateDoc(doc(db, 'eventos', eventoId), { currentSongId: targetId, scrollY: 0, directorAutoScroll: false }).catch(e=>console.error(e));
    }

    const cantante = evento?.cantantesPorCancion?.[targetId] || '';
    navigate(`/live/${targetId}?evento=${eventoId}${cantante ? `&cantante=${encodeURIComponent(cantante)}` : ''}`);
  };

  // Función para extraer el ID del video de YouTube
  const getYouTubeId = (url) => {
    if (!url) return null;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };
  const ytId = cancion?.youtubeUrl ? getYouTubeId(cancion.youtubeUrl) : null;

  // Lógica del Metrónomo Auditivo (Click)
  const toggleClick = () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    // En iOS/Safari hay que reanudar el contexto si estaba suspendido
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
    const newState = !clickActive;
    setClickActive(newState);
    clickEnabledRef.current = newState;
  };

  const playClick = (isFirstBeat) => {
    if (!audioCtxRef.current) return;
    const ctx = audioCtxRef.current;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.frequency.value = isFirstBeat ? 1500 : 1000; // Sonido más agudo en el primer golpe
    osc.type = 'sine'; // Tono puro
    
    gain.gain.setValueAtTime(1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1); // El click dura 0.1s
    
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.1);
  };

  // Lógica del Reproductor Personalizado
  const toggleAudio = () => {
    const isMulti = cancion?.multitracks && cancion.multitracks.length > 0;
    
    if (isMulti) {
      const tracks = Object.values(multitrackRefs.current).filter(Boolean);
      if (isPlaying) {
        tracks.forEach(t => t.pause());
      } else {
        // Reanudar contexto de audio (Safari)
        if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') audioCtxRef.current.resume();
        tracks.forEach(t => t.play().catch(e => console.log('Autoplay block:', e)));
      }
      setIsPlaying(!isPlaying);
    } else if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play().catch(e => console.log('Autoplay block:', e));
      }
      setIsPlaying(!isPlaying);
    }
  };
  const handleTimeUpdate = () => {
    const isMulti = cancion?.multitracks && cancion.multitracks.length > 0;
    if (isMulti) {
      const mainTrack = Object.values(multitrackRefs.current)[0];
      if (mainTrack) setCurrentTime(mainTrack.currentTime);
    } else if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };
  const handleSeek = (e) => {
    const time = Number(e.target.value);
    const isMulti = cancion?.multitracks && cancion.multitracks.length > 0;
    if (isMulti) {
      Object.values(multitrackRefs.current).filter(Boolean).forEach(t => t.currentTime = time);
      setCurrentTime(time);
    } else if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };
  const formatTime = (time) => {
    if (!time || isNaN(time)) return "00:00";
    const min = Math.floor(time / 60);
    const sec = Math.floor(time % 60);
    return `${min}:${sec < 10 ? '0' : ''}${sec}`;
  };

  const stopAudio = () => {
    const isMulti = cancion?.multitracks && cancion.multitracks.length > 0;
    if (isMulti) {
      Object.values(multitrackRefs.current).filter(Boolean).forEach(t => {
        t.pause();
        t.currentTime = 0;
      });
    } else if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setIsPlaying(false);
    setCurrentTime(0);
  };

  const handleVolumeChange = (e) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    if (audioRef.current) audioRef.current.volume = newVolume;
    
    let currentMuted = isMuted;
    if (newVolume > 0 && isMuted) {
      setIsMuted(false);
      currentMuted = false;
      if (audioRef.current) audioRef.current.muted = false;
    }

    // Aplicar volumen maestro a todas las pistas individuales
    Object.keys(multitrackRefs.current).forEach(trackId => {
      const el = multitrackRefs.current[trackId];
      if (el) {
        el.volume = (trackVolumes[trackId] ?? 1) * newVolume;
        el.muted = currentMuted || (trackMutes[trackId] || false);
      }
    });
  };

  const toggleMute = () => {
    const newMutedState = !isMuted;
    setIsMuted(newMutedState);
    if (audioRef.current) audioRef.current.muted = newMutedState;

    // Aplicar mute maestro a todas las pistas individuales
    Object.keys(multitrackRefs.current).forEach(trackId => {
      const el = multitrackRefs.current[trackId];
      if (el) el.muted = newMutedState || (trackMutes[trackId] || false);
    });
  };

  // LÓGICA DE CONSOLA MULTITRACK (MEZCLADORA)
  const handleTrackVolumeChange = (trackId, newVol) => {
    setTrackVolumes(prev => ({...prev, [trackId]: newVol}));
    if (multitrackRefs.current[trackId]) multitrackRefs.current[trackId].volume = newVol * volume;
  };

  const toggleTrackMute = (trackId) => {
    setTrackMutes(prev => {
      const trackIsMuted = !prev[trackId];
      if (multitrackRefs.current[trackId]) multitrackRefs.current[trackId].muted = isMuted || trackIsMuted;
      return {...prev, [trackId]: trackIsMuted};
    });
  };

  const applyPanToTrack = (trackId, panValue) => {
    try {
      if (!audioCtxRef.current) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        audioCtxRef.current = new AudioContext();
      }
      if (audioCtxRef.current.state === 'suspended') audioCtxRef.current.resume();

      const el = multitrackRefs.current[trackId];
      if (el) {
        if (!el.crossOrigin) el.crossOrigin = "anonymous";
        
        if (!el._sourceNode) {
          el._sourceNode = audioCtxRef.current.createMediaElementSource(el);
          const panner = audioCtxRef.current.createStereoPanner ? audioCtxRef.current.createStereoPanner() : audioCtxRef.current.createPanner();
          el._sourceNode.connect(panner);
          panner.connect(audioCtxRef.current.destination);
          pannerNodesRef.current[trackId] = panner;
        }

        const panner = pannerNodesRef.current[trackId];
        if (panner.pan) {
          panner.pan.value = panValue;
        } else {
          panner.setPosition(panValue, 0, 1 - Math.abs(panValue));
        }
      }
    } catch (err) {
      console.error("Error aplicando Paneo", err);
    }
  };

  const handleTrackPanChange = (trackId, newPan) => {
    setTrackPans(prev => ({...prev, [trackId]: newPan}));
    applyPanToTrack(trackId, newPan);
  };

  // LÓGICA DE IN-EARS: MODO SPLIT (L/R) Global
  const toggleSplitMode = () => {
    const nextSplit = !splitMode;
    setSplitMode(nextSplit);
    
    if (!cancion.multitracks) return;

    cancion.multitracks.forEach(track => {
      const isLeft = track.nombre.toLowerCase().includes('click') || track.nombre.toLowerCase().includes('guía') || track.nombre.toLowerCase().includes('guia');
      const targetPan = nextSplit ? (isLeft ? -1 : 1) : 0;
      setTrackPans(prev => ({...prev, [track.id]: targetPan}));
      applyPanToTrack(track.id, targetPan);
    });
  };

  const handleSaveNota = async () => {
    setSavingNota(true);
    try {
      // Guardamos la nota dentro de la subcolección privada del usuario
      await setDoc(doc(db, 'usuarios', user.uid, 'notas', id), {
        texto: nota,
        fechaActualizacion: new Date().toISOString()
      });
      setShowNotes(false);
    } catch (e) {
      console.error(e);
    } finally {
      setSavingNota(false);
    }
  };

  // Extraer ID de youtube para el Modal de Recursos
  const getResourceYtId = (url) => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };

  // Agrupar recursos por instrumento
  const recursosAgrupados = cancion?.recursos?.reduce((acc, r) => {
    if (!acc[r.instrumento]) acc[r.instrumento] = [];
    acc[r.instrumento].push(r);
    return acc;
  }, {}) || {};

  // Tailwind classes para UI Impecable
  return (
    <div className={`h-[100dvh] overflow-hidden ${preferences.darkMode ? 'bg-zinc-900 text-white' : 'bg-white text-zinc-900'} flex flex-col`}>
      
      {/* Barra superior con Metrónomo Visual */}
      <div className={`h-2 w-full transition-colors duration-75 ${pulse ? 'bg-green-500' : 'bg-transparent'}`}></div>

      {/* Cabecera Responsiva */}
      <header className="border-b border-zinc-800 sticky top-0 bg-zinc-900/95 backdrop-blur-md z-10 shadow-sm flex flex-col">
        <div className="p-3 sm:p-4 md:px-8 flex justify-between items-start sm:items-center w-full gap-2 sm:gap-4">
          <div className="flex items-start sm:items-center gap-2 sm:gap-3 w-full min-w-0">
            <button onClick={() => navigate(returnPath)} className="p-2 -ml-2 rounded-full hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors" title={eventoId ? "Volver al Setlist" : "Volver al Repertorio"}>
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight leading-tight truncate">{cancion.titulo}</h1>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-zinc-400 text-xs sm:text-sm truncate">{cancion.artista} | {cancion.bpm} BPM</p>
                {cancion.tonosAlternativos && (
                  <span className="hidden sm:inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-zinc-800 border border-zinc-700 text-blue-300">
                    Alt: {cancion.tonosAlternativos.split(',').map(t => {
                        const [n,k] = t.split(':');
                        return `${n}:${traducirAcorde(k?.trim(), preferences?.formatoAcordes)}`;
                    }).join(', ')}
                  </span>
                )}
                <button onClick={toggleClick} className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase transition-colors border ${clickActive ? 'bg-green-500 text-zinc-900 border-green-400 shadow-[0_0_10px_rgba(34,197,94,0.5)]' : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-white'}`}>
                  <Activity size={12} /> Click
                </button>
              </div>
            </div>
          </div>
        
          {/* Controles y Notas */}
          <div className="flex items-start gap-3 shrink-0">
            {cancion.recursos && cancion.recursos.length > 0 && (
              <button onClick={() => setShowRecursos(true)} className="p-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors shadow-[0_0_15px_rgba(37,99,235,0.4)] animate-pulse" title="Ver Tutoriales y Partituras">
                <Library size={20} />
              </button>
            )}
            {eventoId && (user?.rol === 'admin' || user?.rol === 'dueño') && (
              <button onClick={takeControl} 
                className={`flex items-center gap-1.5 p-2.5 rounded-lg transition-colors border shadow-lg font-bold text-[10px] uppercase tracking-wider ${evento?.directorId === user?.uid ? 'bg-amber-500 text-zinc-900 border-amber-400 animate-pulse' : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-white hover:border-amber-500'}`}
                title={evento?.directorId === user?.uid ? "Soltar Control" : "Modo Director (Controlar pantallas)"}>
                <Crown size={18} /> <span className="hidden sm:inline">{evento?.directorId === user?.uid ? 'Controlando' : 'Director'}</span>
              </button>
            )}
            <button onClick={toggleFullscreen} className="hidden sm:block p-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white rounded-lg transition-colors border border-zinc-700 shadow-lg" title="Pantalla Completa">
              {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
            </button>
            <button onClick={() => setShowNotes(true)} className="p-2.5 bg-zinc-800 hover:bg-zinc-700 text-amber-400 hover:text-amber-300 rounded-lg transition-colors border border-zinc-700 shadow-lg" title="Mis Notas">
              <FileText size={20} />
            </button>
            {!preferences.ocultarAcordes && (
              <div className="flex flex-col items-end gap-2">
              <div className="flex bg-zinc-800 rounded-lg overflow-hidden border border-zinc-700 shadow-lg">
                <button onClick={() => setSemitonosOffset(s => s - 1)} className="px-3 sm:px-4 py-1.5 sm:py-2 hover:bg-zinc-700 text-zinc-300 font-bold active:bg-zinc-600 text-lg sm:text-xl">-</button>
                <div className="px-3 py-1 bg-zinc-950 text-yellow-400 font-bold flex items-center justify-center min-w-[3rem]">
                  {traducirAcorde(transponerNota(cancion.tonoOriginal, semitonosOffset), preferences?.formatoAcordes)}
                </div>
                <button onClick={() => setSemitonosOffset(s => s + 1)} className="px-3 sm:px-4 py-1.5 sm:py-2 hover:bg-zinc-700 text-zinc-300 font-bold active:bg-zinc-600 text-lg sm:text-xl">+</button>
              </div>
              {esGuitarrista && semitonosOffset !== 0 && (
                <span className="text-[10px] text-zinc-400 font-medium bg-zinc-800 px-2 py-0.5 rounded-full">
                  Modo Capo Disp.
                </span>
              )}
            </div>
            )}
          </div>
        </div>

        {/* Reproductor de Audio Personalizado */}
        {(cancion.multitracks?.length > 0 || cancion.audioUrl) && (
          <div className="px-4 md:px-8 pb-4 w-full animate-in fade-in slide-in-from-top-2">
            {/* Reproductor de Audio Personalizado y Responsivo */}
            <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-3 bg-zinc-950/60 border border-zinc-800/80 py-2 px-3 rounded-2xl w-full xl:w-2/3 shadow-inner">
              
              {/* Fila 1 en móvil: Play/Stop/Progreso */}
              <div className="flex items-center gap-2 sm:gap-3 w-full sm:flex-1">
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={toggleAudio} className="w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center bg-white hover:bg-zinc-200 text-zinc-900 rounded-xl shadow-md transition-all active:scale-95">
                    {isPlaying ? <Pause size={16} fill="currentColor"/> : <Play size={16} fill="currentColor" className="ml-0.5" />}
                  </button>
                  <button onClick={stopAudio} className="w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white rounded-xl shadow-md transition-all active:scale-95" title="Detener y Reiniciar">
                    <Square size={14} fill="currentColor" />
                  </button>
                </div>
                
                <div className="flex-1 flex items-center gap-2 px-1">
                  <span className="text-[10px] sm:text-xs font-mono text-zinc-400 w-8 sm:w-10 text-right">{formatTime(currentTime)}</span>
                  <input type="range" min="0" max={duration || 100} value={currentTime} onChange={handleSeek} className="flex-1 h-1.5 bg-zinc-800 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full hover:[&::-webkit-slider-thumb]:bg-zinc-200" />
                  <span className="text-[10px] sm:text-xs font-mono text-zinc-500 w-8 sm:w-10">{formatTime(duration)}</span>
                </div>
              </div>
              
              {/* Fila 2 en móvil: Volumen + Mezcladora */}
              <div className="flex items-center justify-between sm:justify-start w-full sm:w-auto sm:border-l sm:border-zinc-800 sm:pl-3 gap-2">
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={toggleMute} className="text-zinc-400 hover:text-white transition-colors" title={isMuted ? "Quitar silencio" : "Silenciar"}>
                    {isMuted || volume === 0 ? <VolumeX size={16} /> : volume < 0.5 ? <Volume1 size={16} /> : <Volume2 size={16} />}
                  </button>
                  <input type="range" min="0" max="1" step="0.01" value={isMuted ? 0 : volume} onChange={handleVolumeChange} className="w-20 sm:w-16 h-1.5 bg-zinc-800 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full hover:[&::-webkit-slider-thumb]:bg-zinc-200" title="Volumen General" />
                </div>

                {cancion.multitracks?.length > 0 && (
                  <button onClick={() => setShowMixer(true)} className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors active:scale-95 shadow-md">
                    <SlidersHorizontal size={14} className="sm:w-4 sm:h-4"/> <span className="hidden sm:inline">Mezcladora</span>
                  </button>
                )}
              </div>

              {/* Carga invisible de los audios */}
              {cancion.multitracks?.length > 0 ? (
                cancion.multitracks.map((track, idx) => (
                  <audio 
                    key={track.id} 
                    ref={el => multitrackRefs.current[track.id] = el} 
                    src={track.url} 
                    preload="auto"
                    crossOrigin="anonymous" // Fundamental para que funcione el In-Ear L/R
                    onTimeUpdate={idx === 0 ? handleTimeUpdate : null} 
                    onLoadedMetadata={idx === 0 ? (e) => setDuration(e.target.duration) : null} 
                    onEnded={idx === 0 ? () => setIsPlaying(false) : null} 
                    onCanPlay={(e) => { e.target.volume = (trackVolumes[track.id] ?? 1) * volume; e.target.muted = isMuted || (trackMutes[track.id] || false); }}
                    className="hidden" 
                  />
                ))
              ) : (
                <audio ref={audioRef} src={cancion.audioUrl} onTimeUpdate={handleTimeUpdate} onLoadedMetadata={(e) => setDuration(e.target.duration)} onEnded={() => setIsPlaying(false)} onCanPlay={(e) => { e.target.volume = volume; e.target.muted = isMuted; }} className="hidden" />
              )}
            </div>
          </div>
        )}
        {(!cancion.audioUrl && !(cancion.multitracks?.length > 0)) && ytId && (
          <div className="px-4 md:px-8 pb-4 w-full animate-in fade-in slide-in-from-top-2">
            {/* Truco visual: h-14 (56px) oculta el video y solo deja la barra de controles de YouTube */}
            <div className="w-full xl:w-2/3 rounded-2xl overflow-hidden shadow-inner border border-zinc-800/80 bg-zinc-950 h-14">
               <iframe width="100%" height="100%" src={`https://www.youtube.com/embed/${ytId}?rel=0&playsinline=1`} title="Reproductor de YouTube" frameBorder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen></iframe>
            </div>
          </div>
        )}
      </header>

      {/* Contenido (Letras y Acordes) */}
      <main ref={scrollRef} className="flex-1 p-4 md:p-8 pb-24 overflow-y-auto w-full max-w-screen-2xl mx-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]" style={{ fontSize: `${fontSize}px` }}>
         
         {/* Renderizar Nota Personal (Si existe) */}
         {nota && !showNotes && (
           <div onClick={() => setShowNotes(true)} className="mb-8 p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl cursor-pointer hover:bg-amber-500/20 transition-colors break-inside-avoid shadow-inner">
             <div className="flex items-center gap-2 text-amber-500 font-bold mb-2"><FileText size={16}/> Mis Apuntes Privados</div>
             <p className="text-amber-200/90 text-[0.8em] whitespace-pre-wrap leading-relaxed font-medium">{nota}</p>
           </div>
         )}

         <div className="md:columns-2 lg:columns-3 xl:columns-4 gap-8 md:gap-12">
         {seccionesParsed.map((seccion, idxSeccion) => (
           <div key={idxSeccion} className="mb-8 break-inside-avoid">
              <span className={`text-[0.65em] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg mb-3 inline-block shadow-sm ${preferences.darkMode ? 'bg-zinc-800 text-blue-400 border border-zinc-700' : 'bg-blue-50 text-blue-700 border border-blue-200'}`}>
                {seccion.titulo}
              </span>
              
              {seccion.lineas.map((linea, idxLinea) => (
                <div key={idxLinea} className="flex flex-wrap items-end gap-x-1.5 md:gap-x-2 gap-y-4 sm:gap-y-6 mt-4 font-medium leading-tight">
                  {linea.map((palabra, idxPalabra) => (
                    <div key={idxPalabra} className="flex items-end whitespace-nowrap">
                      {palabra.map((silaba, idxSilaba) => (
                        <div key={idxSilaba} className="flex flex-col justify-end items-start">
                          {!preferences.ocultarAcordes && (
                            <span className={`font-bold min-h-[1.25rem] flex items-end mb-0.5 text-[0.9em] ${preferences.darkMode ? 'text-yellow-400' : 'text-blue-600'}`}>
                              {silaba.acorde ? traducirAcorde(transponerNota(silaba.acorde, semitonosOffset), preferences?.formatoAcordes) : ""}
                            </span>
                          )}
                          <span>{silaba.texto}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ))}
           </div>
         ))}
         </div>
      </main>

      {/* Botones flotantes laterales de navegación (Solo Desktop/Tablet) */}
      {eventoId && prevSongId && (
        <button onClick={() => goToSong(prevSongId)} className="hidden md:flex fixed left-4 top-1/2 -translate-y-1/2 p-4 bg-zinc-900/40 hover:bg-zinc-800/80 text-white rounded-full backdrop-blur-md border border-zinc-700/50 transition-all z-20 shadow-2xl hover:scale-110 active:scale-95" title="Canción Anterior">
          <SkipBack size={28} />
        </button>
      )}
      
      {eventoId && nextSongId && (
        <button onClick={() => goToSong(nextSongId)} className="hidden md:flex fixed right-4 top-1/2 -translate-y-1/2 p-4 bg-zinc-900/40 hover:bg-zinc-800/80 text-white rounded-full backdrop-blur-md border border-zinc-700/50 transition-all z-20 shadow-2xl hover:scale-110 active:scale-95" title="Siguiente Canción">
          <SkipForward size={28} />
        </button>
      )}

      {/* Botón Flotante Auto-Scroll (Solo visible en móviles) */}
      <button
        onClick={toggleAutoScroll}
        className={`md:hidden fixed bottom-20 right-4 p-3 rounded-full shadow-2xl z-30 transition-all ${isAutoScrolling ? 'bg-amber-500 text-zinc-900 animate-pulse' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white border border-zinc-700'}`}
        title="Auto-Scroll"
      >
        {isAutoScrolling ? <Pause size={20} /> : <Play size={20} className="ml-1" />}
      </button>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 md:bottom-4 w-full md:w-max md:left-1/2 md:-translate-x-1/2 bg-zinc-950 md:bg-zinc-900/95 md:backdrop-blur-md border-t md:border border-zinc-800 flex justify-around items-center py-2.5 px-4 md:px-8 md:rounded-2xl shadow-2xl safe-area-pb md:gap-8 z-20">
        {eventoId && (
          <button onClick={() => prevSongId && goToSong(prevSongId)} disabled={!prevSongId} className={`flex flex-col items-center transition-transform active:scale-95 ${!prevSongId ? 'text-zinc-800 cursor-not-allowed' : 'text-zinc-400 hover:text-white'}`}>
            <SkipBack size={20} />
            <span className="text-[9px] mt-0.5">Anterior</span>
          </button>
        )}
        
        <button onClick={() => setFontSize(f => Math.max(16, f - 2))} className="flex flex-col items-center text-zinc-400 hover:text-white active:scale-95 transition-transform">
          <span className="text-lg font-bold font-serif leading-none mt-0.5">A-</span>
          <span className="text-[9px] mt-1">Reducir</span>
        </button>
        <button className="flex flex-col items-center text-red-500 font-bold">
          <div onClick={() => navigate(returnPath)} className="bg-red-500/20 p-1.5 rounded-full shadow-[0_0_10px_rgba(239,68,68,0.5)] hover:bg-red-500/30 transition-colors cursor-pointer">
             <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
          </div>
          <span className="text-[9px] mt-0.5">Cerrar</span>
        </button>
        <button onClick={() => setFontSize(f => Math.min(60, f + 2))} className="flex flex-col items-center text-zinc-400 hover:text-white active:scale-95 transition-transform">
          <span className="text-xl font-bold font-serif leading-none mt-0.5">A+</span>
          <span className="text-[9px] mt-1">Aumentar</span>
        </button>

        {eventoId && (
          <button onClick={() => nextSongId && goToSong(nextSongId)} disabled={!nextSongId} className={`flex flex-col items-center transition-transform active:scale-95 ${!nextSongId ? 'text-zinc-800 cursor-not-allowed' : 'text-zinc-400 hover:text-white'}`}>
            <SkipForward size={20} />
            <span className="text-[9px] mt-0.5">Siguiente</span>
          </button>
        )}
      </nav>

      {/* MODAL CONSOLA MULTITRACK */}
      {showMixer && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-in fade-in">
          <div className="bg-zinc-900 w-full max-w-2xl rounded-3xl border border-zinc-700 shadow-2xl flex flex-col overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b border-zinc-800 bg-zinc-950">
              <h3 className="font-bold text-white flex items-center gap-2"><SlidersHorizontal size={20} className="text-indigo-500"/> Consola de Mezcla</h3>
              <button onClick={() => setShowMixer(false)} className="text-zinc-500 hover:text-white bg-zinc-800 p-1.5 rounded-lg"><X size={20} /></button>
            </div>
            
            {/* Contenido de la Mezcladora */}
            <div className="p-6 flex flex-col gap-6 flex-1 overflow-y-auto">
              
              {/* Panel Superior: Master y Split */}
              <div className="flex flex-col md:flex-row gap-4">
                {/* Tarjeta Split L/R */}
                <div className="flex-1 flex justify-between items-center bg-zinc-950 p-4 rounded-2xl border border-zinc-800 shadow-inner">
                  <div>
                    <h4 className="font-bold text-white flex items-center gap-2"><Headphones size={18} className="text-amber-500"/> Modo Split (L/R)</h4>
                    <p className="text-xs text-zinc-400 mt-1">Click a In-Ears (L), Pistas a P.A. (R).</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" checked={splitMode} onChange={toggleSplitMode} className="sr-only peer" />
                    <div className="w-11 h-6 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
                  </label>
                </div>
                {/* Tarjeta Master Volume */}
                <div className="flex-1 bg-zinc-950 p-4 rounded-2xl border border-zinc-800 flex flex-col justify-center shadow-inner">
                  <div className="flex justify-between items-center mb-3">
                    <h4 className="font-bold text-white flex items-center gap-2"><Volume2 size={18} className="text-blue-500"/> Master General</h4>
                    <div className="flex items-center gap-1.5">
                      <button onClick={stopAudio} className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white rounded-md transition-colors"><Square size={12} fill="currentColor" /></button>
                      <button onClick={toggleAudio} className="p-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md transition-colors">
                        {isPlaying ? <Pause size={12} fill="currentColor"/> : <Play size={12} fill="currentColor" className="ml-0.5" />}
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button onClick={toggleMute} className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs transition-all shrink-0 ${isMuted || volume === 0 ? 'bg-red-500 text-white shadow-[0_0_10px_rgba(239,68,68,0.5)]' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'}`}>
                      {isMuted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
                    </button>
                    <input type="range" min="0" max="1" step="0.01" value={isMuted ? 0 : volume} onChange={handleVolumeChange} className="flex-1 h-2 bg-zinc-800 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:rounded-full hover:[&::-webkit-slider-thumb]:bg-blue-400" />
                    <span className="text-xs font-bold text-zinc-400 w-8 text-right">{Math.round(volume * 100)}%</span>
                  </div>
                </div>
              </div>

              <div className="space-y-3 pr-2 [&::-webkit-scrollbar]:hidden">
                {cancion.multitracks?.map(track => (
                  <div key={track.id} className="flex flex-col gap-2 bg-zinc-800/40 p-4 rounded-2xl border border-zinc-700/50 hover:border-indigo-500/40 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="w-24 sm:w-28 shrink-0">
                        <p className="text-sm font-black text-zinc-100 truncate">{track.nombre}</p>
                        <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mt-0.5">Vol: {Math.round((trackVolumes[track.id] ?? 1) * 100)}%</p>
                      </div>
                      
                      <div className="flex-1 flex flex-col gap-2">
                        {/* Volumen de Pista */}
                        <div className="flex items-center gap-2 sm:gap-3">
                          <Volume1 size={14} className="text-zinc-500 shrink-0" />
                          <input type="range" min="0" max="1" step="0.01" value={trackMutes[track.id] ? 0 : (trackVolumes[track.id] ?? 1)} onChange={(e) => handleTrackVolumeChange(track.id, parseFloat(e.target.value))} className="flex-1 h-3 bg-zinc-950 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:bg-indigo-500 [&::-webkit-slider-thumb]:rounded-full hover:[&::-webkit-slider-thumb]:bg-indigo-400 [&::-webkit-slider-thumb]:shadow-[0_0_10px_rgba(99,102,241,0.5)]" />
                          <Volume2 size={14} className="text-zinc-500 shrink-0" />
                        </div>
                        {/* Paneo L/R de Pista */}
                        <div className="flex items-center gap-2 sm:gap-3">
                          <span className="text-[10px] font-bold text-zinc-500 w-4 text-center">L</span>
                          <input type="range" min="-1" max="1" step="0.1" value={trackPans[track.id] ?? 0} onChange={(e) => handleTrackPanChange(track.id, parseFloat(e.target.value))} className="flex-1 h-1.5 bg-zinc-950 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:bg-zinc-400 [&::-webkit-slider-thumb]:rounded-full hover:[&::-webkit-slider-thumb]:bg-white" title="Paneo (L / R)" />
                          <span className="text-[10px] font-bold text-zinc-500 w-4 text-center">R</span>
                        </div>
                      </div>

                      <button onClick={() => toggleTrackMute(track.id)} className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center font-black text-sm transition-all active:scale-95 shrink-0 ${trackMutes[track.id] ? 'bg-red-500 text-white shadow-[0_0_15px_rgba(239,68,68,0.5)]' : 'bg-zinc-700 text-zinc-400 hover:bg-zinc-600 hover:text-white'}`}>
                        M
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            {/* Controles de Navegación dentro de la Mezcladora */}
            {eventoId && (
              <div className="flex items-center justify-between p-4 border-t border-zinc-800 bg-zinc-950">
                <button onClick={() => prevSongId && goToSong(prevSongId)} disabled={!prevSongId} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all ${!prevSongId ? 'bg-zinc-900 text-zinc-700 cursor-not-allowed border border-zinc-800' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white active:scale-95 shadow-md'}`}>
                  <SkipBack size={18} /> <span className="hidden sm:inline">Anterior</span>
                </button>
                <div className="text-center px-2">
                  <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">En Vivo</p>
                  <p className="text-sm text-zinc-200 font-bold truncate max-w-[150px] sm:max-w-[250px]">{cancion.titulo}</p>
                </div>
                <button onClick={() => nextSongId && goToSong(nextSongId)} disabled={!nextSongId} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all ${!nextSongId ? 'bg-zinc-900 text-zinc-700 cursor-not-allowed border border-zinc-800' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white active:scale-95 shadow-md'}`}>
                  <span className="hidden sm:inline">Siguiente</span> <SkipForward size={18} />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL DE RECURSOS (VIDEOS / PDF) */}
      {showRecursos && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in">
          <div className="bg-zinc-900 w-full max-w-4xl max-h-[90vh] rounded-3xl border border-zinc-700 shadow-2xl flex flex-col overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b border-zinc-800 bg-zinc-950">
              <h3 className="font-bold text-white flex items-center gap-2"><Library size={20} className="text-blue-500"/> Bóveda de Ensayo</h3>
              <button onClick={() => setShowRecursos(false)} className="text-zinc-500 hover:text-white bg-zinc-800 p-1.5 rounded-lg"><X size={20} /></button>
            </div>
            
            {/* Tabs de Instrumentos */}
            <div className="flex gap-2 p-4 border-b border-zinc-800 overflow-x-auto [&::-webkit-scrollbar]:hidden">
              {Object.keys(recursosAgrupados).map(inst => (
                <button key={inst} onClick={() => setActiveTab(inst)} className={`px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-colors ${activeTab === inst ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'}`}>
                  {inst} ({recursosAgrupados[inst].length})
                </button>
              ))}
            </div>

            {/* Contenido (Cuadricula de Videos/Links) */}
            <div className="p-4 flex-1 overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(recursosAgrupados[activeTab] || []).map(r => (
                  <div key={r.id} className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4 flex flex-col gap-3">
                    <h4 className="font-bold text-zinc-200 truncate flex items-center gap-2">
                      {r.tipo === 'youtube' ? <Video size={16} className="text-red-500 shrink-0"/> : r.tipo === 'pdf' ? <FileText size={16} className="text-amber-500 shrink-0"/> : <ExternalLink size={16} className="text-blue-500 shrink-0"/>}
                      {r.titulo}
                    </h4>
                    
                    {r.tipo === 'youtube' && getResourceYtId(r.url) ? (
                      <div className="aspect-video w-full rounded-xl overflow-hidden border border-zinc-800 bg-black">
                        <iframe width="100%" height="100%" src={`https://www.youtube.com/embed/${getResourceYtId(r.url)}`} frameBorder="0" allowFullScreen></iframe>
                      </div>
                    ) : r.tipo === 'pdf' ? (
                      <a href={r.url} target="_blank" rel="noreferrer" className="w-full py-3 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 border border-amber-500/30 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-colors">
                        <FileText size={18} /> Ver Partitura PDF
                      </a>
                    ) : (
                      <a href={r.url} target="_blank" rel="noreferrer" className="w-full py-3 bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 border border-blue-600/30 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-colors">
                        <ExternalLink size={18} /> Abrir en App Externa
                      </a>
                    )}
                  </div>
                ))}
              </div>
              {(!recursosAgrupados[activeTab] || recursosAgrupados[activeTab].length === 0) && (
                <p className="text-zinc-500 text-center py-12">Selecciona un instrumento de arriba para ver sus tutoriales.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal de Notas Personales */}
      {showNotes && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 animate-in fade-in">
          <div className="bg-zinc-900 w-full max-w-lg rounded-3xl border border-zinc-700 shadow-2xl overflow-hidden flex flex-col">
            <div className="flex justify-between items-center p-4 border-b border-zinc-800">
              <h3 className="font-bold text-white flex items-center gap-2"><FileText size={18} className="text-amber-500"/> Mis Notas Personales</h3>
              <button onClick={() => setShowNotes(false)} className="text-zinc-500 hover:text-white"><X size={24} /></button>
            </div>
            <div className="p-4 flex-1">
              <textarea value={nota} onChange={e => setNota(e.target.value)} placeholder="Ej. Entrar suave en el segundo verso..." className="w-full h-48 bg-zinc-950 border border-zinc-800 rounded-xl p-4 text-zinc-300 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none resize-none"></textarea>
            </div>
            <div className="p-4 border-t border-zinc-800 flex justify-end">
              <button onClick={handleSaveNota} disabled={savingNota} className="px-6 py-2.5 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl flex items-center gap-2 transition-all active:scale-95">
                <Save size={18} /> {savingNota ? 'Guardando...' : 'Guardar Notas'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LiveModeUI;
