import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, onSnapshot, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { ArrowLeft, ChevronRight, Eye, EyeOff, Guitar, Link2, Link2Off, Mic2, Minus, Music2, Plus, Send, Settings2, Type, X } from 'lucide-react';
import { transponerNota, traducirAcorde } from '../../utils/musicCore';
import { parsearCancion } from '../../utils/songParser';

const getSongIdsFromEvent = (evento) => {
  const setlistItems = evento?.setlist || (evento?.canciones || []).map(id => ({ type: 'song', value: id, idLocal: id }));
  return setlistItems.filter(item => item.type === 'song').map(item => item.value);
};

const readLocalSetting = (key, fallback) => {
  if (typeof window === 'undefined') return fallback;
  try {
    const saved = window.localStorage.getItem(key);
    return saved ? JSON.parse(saved) : fallback;
  } catch {
    return fallback;
  }
};

const writeLocalSetting = (key, value) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // La preferencia local no es critica para el retorno.
  }
};

const StageDisplayMusicos = ({ eventoIdOverride, defaultViewMode = 'musico', storageScope = 'stageDisplay', user }) => {
  const { eventoId: routeEventoId } = useParams();
  const eventoId = eventoIdOverride || routeEventoId;
  const navigate = useNavigate();

  const [evento, setEvento] = useState(null);
  const [liveState, setLiveState] = useState(null);
  const [songId, setSongId] = useState(null);
  const [songData, setSongData] = useState(null);
  const [eventSongs, setEventSongs] = useState([]);
  const [slide, setSlide] = useState(null);
  const [nextSlide, setNextSlide] = useState(null);
  const [media, setMedia] = useState(null);
  const [alerta, setAlerta] = useState(null);
  const [nextSong, setNextSong] = useState(null);
  const [showLogo, setShowLogo] = useState(false);
  const [offset, setOffset] = useState(0);
  const [formato, setFormato] = useState('american');
  const [notacion, setNotacion] = useState('sharps');
  const [hora, setHora] = useState(new Date());
  const [previewOpacity, setPreviewOpacity] = useState(0.8);
  const [showConfig, setShowConfig] = useState(false);
  const [secciones, setSecciones] = useState([]);
  const [manualMode, setManualMode] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [showDirectorPanel, setShowDirectorPanel] = useState(false);
  const [stageMsg, setStageMsg] = useState('');
  const [stageTarget, setStageTarget] = useState('all');
  const [stagePriority, setStagePriority] = useState('normal');
  const [viewport, setViewport] = useState(() => ({
    width: typeof window === 'undefined' ? 1024 : window.innerWidth,
    height: typeof window === 'undefined' ? 768 : window.innerHeight
  }));

  const [viewMode, setViewMode] = useState(() => readLocalSetting(`${storageScope}.viewMode`, defaultViewMode));
  const [showChords, setShowChords] = useState(() => readLocalSetting(`${storageScope}.showChords`, defaultViewMode !== 'cantante'));
  const [fontScale, setFontScale] = useState(() => readLocalSetting(`${storageScope}.fontScale`, defaultViewMode === 'cantante' ? 1.08 : 1));

  const isSingerMode = viewMode === 'cantante';
  const shouldShowChords = showChords && !isSingerMode;

  useEffect(() => {
    if (defaultViewMode === 'musico' && storageScope === 'stageDisplay') {
      setViewMode('musico');
      setShowChords(true);
    }
  }, [defaultViewMode, storageScope]);

  useEffect(() => writeLocalSetting(`${storageScope}.viewMode`, viewMode), [storageScope, viewMode]);
  useEffect(() => writeLocalSetting(`${storageScope}.showChords`, showChords), [storageScope, showChords]);
  useEffect(() => writeLocalSetting(`${storageScope}.fontScale`, fontScale), [storageScope, fontScale]);

  useEffect(() => {
    const timer = setInterval(() => setHora(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const handleResize = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  useEffect(() => {
    if (!songId) {
      setSongData(null);
      setSecciones([]);
      return;
    }

    const fetchFullSong = async () => {
      const cachedSong = eventSongs.find(song => song.id === songId);
      if (cachedSong) {
        setSongData(cachedSong);
        setSecciones(parsearCancion(cachedSong.letraRaw || ''));
        return;
      }

      const songSnap = await getDoc(doc(db, 'canciones', songId));
      if (songSnap.exists()) {
        const data = { id: songSnap.id, ...songSnap.data() };
        setSongData(data);
        setSecciones(parsearCancion(data.letraRaw || ''));
      }
    };

    fetchFullSong();
  }, [songId, eventSongs]);

  useEffect(() => {
    setOffset(0);
  }, [songId]);

  useEffect(() => {
    if (!manualMode && currentIndex !== -1) {
      const element = document.getElementById(`section-${currentIndex}`);
      if (element) element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [currentIndex, manualMode]);

  useEffect(() => {
    if (!eventoId) return undefined;

    const unsub = onSnapshot(doc(db, 'eventos', eventoId), (snap) => {
      if (!snap.exists()) return;

      const data = snap.data();
      const nextLiveState = data.liveState || {
        activeSongId: data.proyectorSongId || null,
        activeSongTitle: '',
        activeSongIndex: -1,
        activeSectionIndex: data.proyectorSlideIndex ?? -1,
        activeSectionTitle: data.proyectorSlide?.titulo || '',
        updatedAt: Date.now(),
        updatedBy: 'Multimedia'
      };
      const nextSongId = nextLiveState.activeSongId || data.proyectorSongId || null;

      setEvento(data);
      setLiveState(nextLiveState);
      setSlide(data.proyectorSlide || null);
      if (!manualMode) setSongId(nextSongId);
      if (!songId && nextSongId) setSongId(nextSongId);
      setCurrentIndex(nextLiveState.activeSectionIndex ?? data.proyectorSlideIndex ?? -1);
      setMedia(data.proyectorMedia || null);
      setNextSlide(data.proyectorNextSlide || null);
      setAlerta(data.proyectorAlerta || null);
      setNextSong(data.proyectorNextSong || null);
      setShowLogo(data.proyectorLogo || false);
      setOffset(data.proyectorOffset || 0);
      if (data.preferencias?.formatoAcordes) setFormato(data.preferencias.formatoAcordes);
      if (data.preferencias?.notacion) setNotacion(data.preferencias.notacion);
    });

    return () => unsub();
  }, [eventoId, manualMode, songId]);

  useEffect(() => {
    let cancelled = false;
    const songIds = getSongIdsFromEvent(evento);
    if (!songIds.length) {
      setEventSongs([]);
      return undefined;
    }

    const fetchEventSongs = async () => {
      const uniqueIds = [...new Set(songIds)];
      const snaps = await Promise.all(uniqueIds.map(id => getDoc(doc(db, 'canciones', id))));
      if (cancelled) return;
      setEventSongs(snaps.filter(snap => snap.exists()).map(snap => ({ id: snap.id, ...snap.data() })));
    };

    fetchEventSongs();
    return () => { cancelled = true; };
  }, [evento]);

  const liveSongId = liveState?.activeSongId || null;
  const liveSongTitle = liveState?.activeSongTitle || eventSongs.find(song => song.id === liveSongId)?.titulo || 'Sin cancion activa';
  const displayedSongTitle = songData?.titulo || liveSongTitle;
  const displayedSongIsLive = songId && liveSongId && songId === liveSongId;
  const activeSectionTitle = liveState?.activeSectionTitle || (currentIndex >= 0 ? `Seccion ${currentIndex + 1}` : '--');
  const nextSectionTitle = nextSlide?.titulo || nextSong || '--';

  const toneInfo = useMemo(() => {
    if (!songData) return '';
    const originalTone = songData.tonoOriginal || songData.tono || '';
    let targetTone = originalTone;
    const singer = evento?.cantantesPorCancion?.[songData.id];

    if (singer && songData.tonosAlternativos) {
      const match = songData.tonosAlternativos
        .split(',')
        .find(option => option.trim().toLowerCase().startsWith(`${singer.toLowerCase()}:`));
      if (match) targetTone = match.split(':')[1]?.trim() || targetTone;
    }

    if (!targetTone) return '';
    return traducirAcorde(targetTone, formato, notacion);
  }, [songData, evento?.cantantesPorCancion, formato, notacion]);

  const isMobileLandscape = viewport.width > viewport.height && viewport.height <= 500;
  const lyricSize = isMobileLandscape
    ? `clamp(${isSingerMode ? 1.05 : 1.08}rem, ${isSingerMode ? 4.8 : 4.7}vmin, ${isSingerMode ? 2.45 : 2.35}rem)`
    : `clamp(${isSingerMode ? 1.45 : 1.36}rem, ${isSingerMode ? 4.6 : 4.1}vmin, ${isSingerMode ? 4.3 : 3.85}rem)`;
  const chordSize = isMobileLandscape ? 'clamp(0.9rem, 2.7vmin, 1.35rem)' : 'clamp(0.95rem, 2.45vmin, 1.8rem)';
  const scaledLyricSize = `calc(${lyricSize} * ${fontScale})`;
  const scaledChordSize = `calc(${chordSize} * ${fontScale})`;
  const prepareText = nextSlide
    ? (nextSlide.texto.trim() === '' ? `${nextSlide.titulo || 'Instrumental'} (Toda la banda)` : nextSlide.texto.split('\n').map(line => line.trim()).filter(Boolean)[0] || nextSlide.titulo || '---')
    : nextSong || '---';
  const displayedSections = secciones.map((sec, idx) => ({ sec, idx }));

  const returnToLive = () => {
    setManualMode(false);
    if (liveSongId) setSongId(liveSongId);
    setCurrentIndex(liveState?.activeSectionIndex ?? -1);
  };

  const selectManualSong = (id) => {
    setManualMode(true);
    setSongId(id);
  };

  const handleUserScroll = () => {
    if (!manualMode) setManualMode(true);
  };

  const adjustFont = (delta) => {
    setFontScale(prev => Math.min(1.45, Math.max(0.78, Number((prev + delta).toFixed(2)))));
  };

  const hasLyrics = (secciones && secciones.length > 0) || (slide && slide.texto && slide.texto.trim() !== '');
  const alertaData = typeof alerta === 'string' ? { text: alerta, priority: 'urgente', target: 'all' } : alerta;
  const alertIsActive = alertaData && alertaData.active !== false && (!alertaData.expiresAt || alertaData.expiresAt > Date.now());
  const shouldShowAlert = alertIsActive && (!alertaData.target || alertaData.target === 'all' || alertaData.target === 'musicos');
  const alertPriority = alertaData?.priority || 'normal';
  const normalizedRole = (user?.rol || user?.role || '').toLowerCase();
  const ownerEmail = import.meta.env.VITE_OWNER_EMAIL || 'luistorresdrums2024@gmail.com';
  const canSendStageMessages = ['dueño', 'dueno', 'admin', 'multimedia', 'director', 'lider', 'líder'].includes(normalizedRole) || user?.email === ownerEmail;
  const quickStageMessages = ['Repite coro', 'Solo voces', 'Entramos todos', 'Final', 'Sube tono', 'Baja dinámica', 'Más suave', 'Corte', 'Espera', 'Sigue', 'Puente', 'Ministración'];

  const sendStageMessage = async (messageOverride = null) => {
    if (!canSendStageMessages) return;
    const text = typeof messageOverride === 'string' ? messageOverride.trim() : stageMsg.trim();
    if (!text) return;
    const durations = { normal: 7000, importante: 10000, urgente: 16000 };
    const now = Date.now();
    await setDoc(doc(db, 'eventos', eventoId), {
      proyectorAlerta: {
        text,
        priority: stagePriority,
        target: stageTarget,
        sentAt: now,
        expiresAt: now + (durations[stagePriority] || durations.normal),
        active: true,
        sentBy: user?.nombre || user?.email || 'Retorno'
      }
    }, { merge: true });
    if (!messageOverride) setStageMsg('');
  };

  const clearStageMessage = async () => {
    if (!canSendStageMessages) return;
    await setDoc(doc(db, 'eventos', eventoId), { proyectorAlerta: null }, { merge: true });
  };

  return (
    <div
      className="fixed inset-0 h-[100dvh] w-screen max-w-full bg-zinc-950 text-white flex flex-col font-sans overflow-hidden selection:bg-transparent"
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
      onWheel={handleUserScroll}
      onTouchMove={handleUserScroll}
    >
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:88px_88px] pointer-events-none" />

      {manualMode && (
        <div className="relative z-[60] shrink-0 border-b border-amber-300/30 bg-amber-500 text-zinc-950 px-3 py-2 sm:px-5">
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-2">
              <Link2Off size={19} className="mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-wide">Modo manual</p>
                <p className="truncate text-sm font-bold">La cancion en vivo cambio a: {liveSongTitle}</p>
              </div>
            </div>
            <button onClick={returnToLive} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-zinc-950 px-4 py-2 text-xs font-black uppercase text-white active:scale-95">
              <Link2 size={16} /> Volver al vivo
            </button>
          </div>
        </div>
      )}

      {media && media.url && !hasLyrics && (
        <div className="fixed right-3 top-24 z-50 w-44 overflow-hidden rounded-2xl border border-white/20 shadow-2xl sm:right-6 sm:w-64" style={{ opacity: previewOpacity }}>
          <div className="aspect-video bg-black">
            {media.type === 'video' ? <video src={media.url} autoPlay loop muted className="h-full w-full object-cover" /> : <img src={media.url} className="h-full w-full object-cover" alt="" />}
          </div>
          <div className="absolute left-0 top-0 bg-violet-600 px-2 py-1 text-[8px] font-black uppercase">En proyeccion</div>
        </div>
      )}

      <header className="relative z-10 shrink-0 border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur-sm">
        <div className={`mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-3 sm:px-5 lg:px-8 ${isMobileLandscape ? 'py-1' : 'py-2 lg:py-4'}`}>
          <div className="flex min-w-0 items-center gap-2 lg:gap-4">
            <button onClick={() => navigate(`/setlist/${eventoId}`)} className={`shrink-0 rounded-full bg-zinc-800/70 text-zinc-400 transition-colors hover:bg-zinc-700 hover:text-white ${isMobileLandscape ? 'p-1.5' : 'p-2'}`} title="Volver">
              <ArrowLeft className={isMobileLandscape ? 'h-4 w-4' : 'h-5 w-5'} />
            </button>
            <div className="min-w-0">
              <div className={`${manualMode ? 'text-amber-400' : 'text-emerald-400'} flex items-center gap-2 font-black uppercase ${isMobileLandscape ? 'text-[8px] tracking-[0.12em]' : 'text-[10px] tracking-[0.18em]'}`}>
                <span className={`h-2 w-2 rounded-full ${manualMode ? 'bg-amber-400' : 'bg-emerald-400 animate-pulse'}`} />
                {manualMode ? 'Modo manual' : 'Siguiendo en vivo'}
              </div>
              <h1 className={`truncate font-black uppercase tracking-wide text-zinc-100 ${isMobileLandscape ? 'text-base' : 'text-lg sm:text-2xl lg:text-4xl'}`}>
                {displayedSongTitle}
              </h1>
            </div>
          </div>

          <div className={`${isMobileLandscape ? 'block' : 'hidden sm:block'} shrink-0 text-right`}>
            <div className={`font-mono font-black tabular-nums text-white ${isMobileLandscape ? 'text-lg' : 'text-2xl lg:text-4xl'}`}>
              {hora.toLocaleTimeString('es-ES', { hour12: false })}
            </div>
            <p className={`font-bold uppercase tracking-widest text-zinc-500 ${isMobileLandscape ? 'text-[7px]' : 'text-[10px]'}`}>{isSingerMode ? 'Cantante' : 'Musico'}</p>
          </div>
        </div>

        <div className={`mx-auto grid w-full max-w-7xl grid-cols-3 gap-2 px-3 sm:px-5 lg:grid-cols-4 lg:px-8 ${isMobileLandscape ? 'pb-1' : 'pb-2 lg:pb-4'}`}>
          <div className={`rounded-xl border border-zinc-800 bg-zinc-900/70 px-3 ${isMobileLandscape ? 'py-1' : 'py-2'}`}>
            <p className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Tono</p>
            <p className={`truncate font-black text-yellow-300 ${isMobileLandscape ? 'text-sm' : 'text-base lg:text-2xl'}`}>{toneInfo || '--'}</p>
          </div>
          <div className={`rounded-xl border border-zinc-800 bg-zinc-900/70 px-3 ${isMobileLandscape ? 'py-1' : 'py-2'}`}>
            <p className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Actual</p>
            <p className={`truncate font-black text-blue-300 ${isMobileLandscape ? 'text-sm' : 'text-sm lg:text-xl'}`}>{activeSectionTitle}</p>
          </div>
          <div className={`rounded-xl border border-zinc-800 bg-zinc-900/70 px-3 ${isMobileLandscape ? 'py-1' : 'py-2'}`}>
            <p className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Siguiente</p>
            <p className={`truncate font-black text-emerald-300 ${isMobileLandscape ? 'text-sm' : 'text-sm lg:text-xl'}`}>{nextSectionTitle}</p>
          </div>
          <div className="hidden rounded-xl border border-zinc-800 bg-zinc-900/70 px-3 py-2 lg:block">
            <p className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Actualizado por</p>
            <p className="truncate text-sm font-black text-zinc-300">{liveState?.updatedBy || 'Multimedia'}</p>
          </div>
        </div>

        {!isMobileLandscape && eventSongs.length > 0 && (
          <div className={`mx-auto flex w-full max-w-7xl gap-2 overflow-x-auto px-3 sm:px-5 lg:px-8 [&::-webkit-scrollbar]:hidden ${isMobileLandscape ? 'pb-1' : 'pb-2'}`}>
            {eventSongs.map((song, idx) => {
              const isDisplayed = song.id === songId;
              const isLive = song.id === liveSongId;
              return (
                <button
                  key={song.id}
                  onClick={() => selectManualSong(song.id)}
                  className={`inline-flex shrink-0 items-center gap-2 rounded-xl border px-3 font-black transition-colors ${isMobileLandscape ? 'max-w-[10rem] py-1 text-[9px]' : 'max-w-[14rem] py-1.5 text-[10px]'} ${isLive ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-200' : isDisplayed ? 'border-blue-500/50 bg-blue-500/15 text-blue-200' : 'border-zinc-800 bg-zinc-900 text-zinc-400'}`}
                  title={song.titulo}
                >
                  <Music2 size={13} className="shrink-0" />
                  <span className="truncate">{idx + 1}. {song.titulo}</span>
                  {isLive && <span className="rounded bg-emerald-500 px-1.5 py-0.5 text-[8px] uppercase text-zinc-950">Vivo</span>}
                </button>
              );
            })}
          </div>
        )}
      </header>

      {shouldShowAlert && alertPriority === 'urgente' && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[radial-gradient(circle_at_50%_35%,rgba(248,113,113,0.92),rgba(185,28,28,0.82)_45%,rgba(69,10,10,0.72)_100%)] p-8 text-center backdrop-blur-[2px]">
          <div className="absolute inset-0 bg-black/15" />
          <div className="relative rounded-[2rem] border border-white/20 bg-black/20 px-8 py-7 shadow-2xl">
            <h2 className="mb-4 text-4xl font-black uppercase italic text-white md:text-6xl">Urgente / Atención músicos</h2>
            <p className="text-5xl font-black text-white drop-shadow-2xl md:text-8xl">{alertaData.text}</p>
          </div>
        </div>
      )}

      {shouldShowAlert && alertPriority !== 'urgente' && (
        <div className={`fixed left-3 right-3 z-[90] mx-auto max-w-5xl rounded-3xl border px-5 py-4 text-center shadow-2xl backdrop-blur-md ${alertPriority === 'importante' ? 'top-24 border-amber-300/50 bg-amber-500/90 text-zinc-950' : 'bottom-24 border-white/10 bg-zinc-950/88 text-white'}`}>
          <p className={`text-[10px] font-black uppercase tracking-[0.24em] ${alertPriority === 'importante' ? 'text-zinc-900/70' : 'text-emerald-300'}`}>
            {alertPriority === 'importante' ? 'Atención músicos' : 'Mensaje a músicos'}
          </p>
          <p className="mt-1 text-2xl font-black leading-tight sm:text-4xl">{alertaData.text}</p>
        </div>
      )}

      <main className={`relative z-0 min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2 sm:px-5 lg:px-8 [&::-webkit-scrollbar]:hidden ${isMobileLandscape ? 'py-1.5' : 'py-3 lg:py-7'}`}>
        {showLogo ? (
          <div className="flex h-full items-center justify-center text-center">
            <span className="text-2xl font-black italic text-zinc-700 sm:text-5xl">Logo Kadosh en pantalla</span>
          </div>
        ) : secciones.length > 0 ? (
          <div className={`mx-auto flex w-full max-w-7xl flex-col ${isMobileLandscape ? 'gap-2 pb-2' : 'gap-7 pb-8 landscape:gap-4 lg:gap-10'}`}>
            {displayedSections.map(({ sec, idx }) => {
              const isActive = currentIndex === idx && displayedSongIsLive;
              return (
                <section
                  key={`${sec.titulo}-${idx}`}
                  id={`section-${idx}`}
                  className={`rounded-2xl border px-3 transition-all duration-300 sm:px-6 lg:px-9 ${isMobileLandscape ? 'py-2' : 'py-4 sm:py-6 lg:py-8'} ${isActive ? 'border-blue-400 bg-blue-500/12 shadow-[0_0_45px_rgba(59,130,246,0.2)]' : 'border-white/0 bg-transparent opacity-85'}`}
                >
                  <div className={`flex items-center justify-between gap-3 ${isMobileLandscape ? 'mb-2' : 'mb-4'}`}>
                    <span className={`inline-flex rounded-lg px-3 py-1 font-black uppercase tracking-widest ${isMobileLandscape ? 'text-[9px]' : 'text-[10px] sm:text-xs'} ${isActive ? 'bg-blue-500 text-white' : 'bg-zinc-800 text-zinc-500'}`}>
                      {sec.titulo}
                    </span>
                    {isActive && <span className="hidden text-[10px] font-black uppercase tracking-widest text-blue-200 sm:inline">En vivo</span>}
                  </div>

                  <div className={`flex flex-col ${isMobileLandscape ? 'gap-2' : isSingerMode ? 'gap-3 sm:gap-4' : 'gap-4 sm:gap-6'}`}>
                    {(sec.items?.length ? sec.items : sec.lineas.map(line => ({ type: 'lyrics', line }))).map((item, idxL) => item.type === 'cue' ? (
                      <div key={idxL} className={`mx-auto inline-flex max-w-full items-center justify-center rounded-2xl border px-4 py-2 text-center font-black uppercase tracking-wide ${isSingerMode ? 'border-violet-300/50 bg-violet-500/25 text-violet-100' : 'border-violet-400/30 bg-violet-500/15 text-violet-200'}`} style={{ fontSize: `calc(${isSingerMode ? 'clamp(1rem, 3.4vmin, 2.1rem)' : 'clamp(0.82rem, 2.4vmin, 1.35rem)'} * ${fontScale})` }}>
                        * {item.text}
                      </div>
                    ) : item.type === 'blank' ? (
                      <div key={idxL} className={isMobileLandscape ? 'h-2 w-full' : 'h-5 w-full'} />
                    ) : (
                      <div key={idxL} className="flex min-h-[1.8rem] w-full flex-wrap justify-center gap-x-2 gap-y-2 text-center sm:gap-x-3 lg:gap-x-4">
                        {item.line.map((palabra, idxP) => (
                          <div key={idxP} className="flex items-end whitespace-nowrap">
                            {palabra.map((silaba, idxS) => (
                              <span key={idxS} className="inline-flex flex-col items-start justify-end">
                                {shouldShowChords && (
                                  <span
                                    className={`mb-1 flex min-h-[1.05em] items-end font-black leading-none ${isActive ? 'text-yellow-300' : 'text-zinc-500'}`}
                                    style={{ fontSize: scaledChordSize }}
                                  >
                                    {silaba.acorde ? traducirAcorde(transponerNota(silaba.acorde, offset), formato, notacion) : ''}
                                  </span>
                                )}
                                <span
                                  className={`font-black leading-[1.08] tracking-normal drop-shadow-lg ${isActive ? 'text-white' : 'text-zinc-300'}`}
                                  style={{ fontSize: scaledLyricSize }}
                                >
                                  {silaba.texto}
                                </span>
                              </span>
                            ))}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        ) : slide ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <span className="text-3xl font-black italic text-zinc-600 sm:text-6xl">{slide.titulo ? slide.titulo.toUpperCase() : 'INSTRUMENTAL'}</span>
            <span className="mt-4 text-xs font-black uppercase tracking-widest text-emerald-400">Toda la banda</span>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-center">
            <span className="text-3xl font-black text-zinc-800 sm:text-6xl">KADOSH APP</span>
          </div>
        )}
      </main>

      <footer className={`relative z-10 shrink-0 border-t border-zinc-800 bg-zinc-950/95 px-2 shadow-[0_-10px_30px_rgba(0,0,0,0.45)] sm:px-5 lg:px-8 ${isMobileLandscape ? 'py-1' : 'py-2'}`}>
        <div className={`mx-auto flex w-full max-w-7xl gap-2 md:flex-row md:items-center md:justify-between ${isMobileLandscape ? 'flex-row items-center' : 'flex-col'}`}>
          <div className={`flex min-w-0 items-center rounded-xl border border-zinc-800 bg-zinc-900/80 px-3 md:flex-1 ${isMobileLandscape ? 'gap-2 py-1' : 'gap-3 py-2'}`}>
            <div className={`flex shrink-0 items-center justify-center rounded-full border border-zinc-700 bg-zinc-800 ${isMobileLandscape ? 'h-7 w-7' : 'h-9 w-9'}`}>
              <ChevronRight className={`${isMobileLandscape ? 'h-4 w-4' : 'h-5 w-5'} text-emerald-300`} />
            </div>
            <div className="min-w-0">
              <p className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Preparar</p>
              <p className={`truncate font-black text-zinc-200 ${isMobileLandscape ? 'text-sm' : 'text-sm sm:text-xl'}`}>{prepareText}</p>
            </div>
          </div>

          <div className={`flex items-center gap-2 overflow-x-auto pb-0.5 md:justify-end [&::-webkit-scrollbar]:hidden ${isMobileLandscape ? 'shrink-0' : ''}`}>
            <button onClick={() => setViewMode(isSingerMode ? 'musico' : 'cantante')} className={`inline-flex shrink-0 items-center gap-2 rounded-xl border font-black uppercase ${isMobileLandscape ? 'px-2 py-1.5 text-[0px]' : 'px-3 py-2 text-[11px]'} ${isSingerMode ? 'border-pink-400/40 bg-pink-500/15 text-pink-200' : 'border-blue-400/40 bg-blue-500/15 text-blue-200'}`}>
              {isSingerMode ? <Mic2 size={16} /> : <Guitar size={16} />}
              <span className={isMobileLandscape ? 'sr-only' : ''}>{isSingerMode ? 'Cantante' : 'Musico'}</span>
            </button>
            <button onClick={() => setShowChords(prev => !prev)} className={`inline-flex shrink-0 items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900 font-black uppercase text-zinc-300 ${isMobileLandscape ? 'px-2 py-1.5 text-[0px]' : 'px-3 py-2 text-[11px]'}`}>
              {shouldShowChords ? <EyeOff size={16} /> : <Eye size={16} />}
              <span className={isMobileLandscape ? 'sr-only' : ''}>{shouldShowChords ? 'Ocultar acordes' : 'Ver acordes'}</span>
            </button>
            <button onClick={() => adjustFont(-0.08)} className={`inline-flex shrink-0 items-center justify-center rounded-xl border border-zinc-700 bg-zinc-900 text-zinc-300 ${isMobileLandscape ? 'h-8 w-8' : 'h-10 w-10'}`} title="Reducir letra">
              <Minus size={17} />
            </button>
            <button onClick={() => adjustFont(0.08)} className={`inline-flex shrink-0 items-center justify-center rounded-xl border border-zinc-700 bg-zinc-900 text-zinc-300 ${isMobileLandscape ? 'h-8 w-8' : 'h-10 w-10'}`} title="Aumentar letra">
              <Plus size={17} />
            </button>
            <button onClick={() => setShowConfig(!showConfig)} className={`inline-flex shrink-0 items-center justify-center rounded-xl border ${isMobileLandscape ? 'h-8 w-8' : 'h-10 w-10'} ${showConfig ? 'border-violet-400 bg-violet-600 text-white' : 'border-zinc-700 bg-zinc-900 text-zinc-300'}`} title="Ajustes">
              <Settings2 size={17} />
            </button>
            {manualMode && (
              <button onClick={returnToLive} className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-emerald-500 px-3 py-2 text-[11px] font-black uppercase text-zinc-950">
                <Link2 size={16} /> Vivo
              </button>
            )}
          </div>
        </div>
      </footer>

      {canSendStageMessages && (
        <div className="fixed left-3 bottom-24 z-50 sm:left-5">
          {!showDirectorPanel ? (
            <button
              onClick={() => setShowDirectorPanel(true)}
              className="flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-400/25 bg-zinc-950/80 text-emerald-200 shadow-2xl backdrop-blur-md"
              title="Indicaciones"
            >
              <Send size={17} />
            </button>
          ) : (
            <div className="w-[min(92vw,340px)] rounded-3xl border border-white/10 bg-zinc-900/96 p-4 shadow-2xl backdrop-blur-md">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-xs font-black uppercase tracking-widest text-emerald-300">Indicaciones</p>
                <button onClick={() => setShowDirectorPanel(false)} className="rounded-xl bg-zinc-800 p-2 text-zinc-300"><X size={15}/></button>
              </div>

              <div className="mb-3 grid grid-cols-3 gap-1 rounded-2xl bg-zinc-950 p-1">
                {[
                  ['musicos', 'Músicos'],
                  ['cantantes', 'Cantantes'],
                  ['all', 'Todos']
                ].map(([target, label]) => (
                  <button key={target} onClick={() => setStageTarget(target)} className={`rounded-xl px-2 py-2 text-[9px] font-black uppercase ${stageTarget === target ? 'bg-blue-600 text-white' : 'text-zinc-500'}`}>{label}</button>
                ))}
              </div>

              <div className="mb-3 grid grid-cols-3 gap-1 rounded-2xl bg-zinc-950 p-1">
                {['normal', 'importante', 'urgente'].map(level => (
                  <button key={level} onClick={() => setStagePriority(level)} className={`rounded-xl px-2 py-2 text-[9px] font-black uppercase ${stagePriority === level ? (level === 'urgente' ? 'bg-red-600 text-white' : level === 'importante' ? 'bg-amber-500 text-zinc-950' : 'bg-emerald-600 text-white') : 'text-zinc-500'}`}>{level}</button>
                ))}
              </div>

              <div className="mb-3 grid grid-cols-2 gap-2">
                {quickStageMessages.map(msg => (
                  <button key={msg} onClick={() => sendStageMessage(msg)} className="rounded-xl bg-zinc-800 px-3 py-2 text-[10px] font-black uppercase text-zinc-200 active:scale-95">{msg}</button>
                ))}
              </div>

              <div className="flex gap-2">
                <input value={stageMsg} onChange={e => setStageMsg(e.target.value)} placeholder="Mensaje manual..." className="min-w-0 flex-1 rounded-2xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500" />
                <button onClick={() => sendStageMessage()} disabled={!stageMsg.trim()} className="rounded-2xl bg-emerald-600 px-3 text-white disabled:opacity-40"><Send size={16}/></button>
                <button onClick={clearStageMessage} className="rounded-2xl bg-zinc-800 px-3 text-zinc-300"><X size={16}/></button>
              </div>
            </div>
          )}
        </div>
      )}

      {showConfig && (
        <div className="fixed bottom-20 right-2 z-50 w-[min(92vw,360px)] rounded-2xl border border-white/10 bg-zinc-900/95 p-4 shadow-2xl backdrop-blur-md sm:right-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <p className="text-xs font-black uppercase tracking-widest text-zinc-400">Ajustes locales</p>
            <button onClick={() => setShowConfig(false)} className="text-xs font-black uppercase text-zinc-500">Cerrar</button>
          </div>

          <div className="space-y-4">
            <div>
              <p className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-zinc-500"><Type size={14} /> Letra {Math.round(fontScale * 100)}%</p>
              <div className="flex items-center gap-2">
                <button onClick={() => adjustFont(-0.08)} className="h-10 w-10 rounded-xl bg-zinc-800 font-black">-</button>
                <input type="range" min="0.78" max="1.45" step="0.01" value={fontScale} onChange={(e) => setFontScale(Number(e.target.value))} className="flex-1 accent-emerald-500" />
                <button onClick={() => adjustFont(0.08)} className="h-10 w-10 rounded-xl bg-zinc-800 font-black">+</button>
              </div>
            </div>

            <div>
              <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-zinc-500">Corregir tono local</p>
              <div className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950/50 p-2">
                <button onClick={() => setOffset(prev => prev - 1)} className="h-10 w-10 rounded-lg bg-zinc-800 text-xl font-bold">-</button>
                <div className="min-w-[3rem] text-center">
                  <p className="text-lg font-black text-yellow-300">{offset > 0 ? `+${offset}` : offset}</p>
                  <p className="text-[8px] font-bold text-zinc-500">SEM</p>
                </div>
                <button onClick={() => setOffset(prev => prev + 1)} className="h-10 w-10 rounded-lg bg-zinc-800 text-xl font-bold">+</button>
              </div>
            </div>

            <button onClick={() => setFormato(f => f === 'american' ? 'latin' : 'american')} className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-xs font-black uppercase text-zinc-300">
              {formato === 'american' ? 'Cifrado americano' : 'Sistema latino'}
            </button>

            <div>
              <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-zinc-500">Opacidad video: {Math.round(previewOpacity * 100)}%</p>
              <input type="range" min="0" max="1" step="0.1" value={previewOpacity} onChange={(e) => setPreviewOpacity(parseFloat(e.target.value))} className="w-full accent-violet-500" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StageDisplayMusicos;
