import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Headphones,
  ListMusic,
  Loader2,
  Music2,
  Pause,
  Play,
  Radio,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Square,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { db } from '../../config/firebase';
import { getEventSetlistItems, getEventSongIds } from '../../utils/setlistUtils';
import MultitrackPlaybackEngine from '../../utils/multitrackPlaybackEngine';
import {
  getMultitrackSetlistReadiness,
  isMultitrackCacheSupported,
  prepareMultitrackSetlist,
} from '../../utils/multitrackAudioCache';
import { getMusicalPosition, getNextMusicalBoundary } from '../../utils/musicalGrid';

const EMPTY_PLAYBACK = {
  playing: false,
  currentTime: 0,
  duration: 0,
  shortestStemDuration: 0,
  masterVolume: 1,
  stems: [],
  loop: null,
};

const formatTime = (value) => {
  const seconds = Number(value) || 0;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60);
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
};

const getSongAudioCount = (song) => {
  if (Array.isArray(song?.multitracks) && song.multitracks.length > 0) {
    return song.multitracks.filter((track) => track?.url).length;
  }
  return song?.audioUrl ? 1 : 0;
};

const MultitrackLive = ({ user }) => {
  const { eventoId } = useParams();
  const navigate = useNavigate();
  const engineRef = useRef(null);
  if (!engineRef.current) engineRef.current = new MultitrackPlaybackEngine();

  const [evento, setEvento] = useState(null);
  const [songsById, setSongsById] = useState({});
  const [loadingSetlist, setLoadingSetlist] = useState(true);
  const [setlistError, setSetlistError] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loadingAudio, setLoadingAudio] = useState(false);
  const [loadProgress, setLoadProgress] = useState({ completed: 0, total: 0, cacheHits: 0 });
  const [audioError, setAudioError] = useState('');
  const [stemErrors, setStemErrors] = useState([]);
  const [playback, setPlayback] = useState(EMPTY_PLAYBACK);
  const [preparingSetlist, setPreparingSetlist] = useState(false);
  const [prepareProgress, setPrepareProgress] = useState({ completed: 0, total: 0, cached: 0, downloaded: 0, errors: 0 });
  const [prepareSummary, setPrepareSummary] = useState(null);
  const [checkingReadiness, setCheckingReadiness] = useState(false);
  const [readiness, setReadiness] = useState(null);
  const [gridOffsets, setGridOffsets] = useState({});
  const [loopError, setLoopError] = useState('');
  const [sectionsBySong, setSectionsBySong] = useState({});
  const [sectionError, setSectionError] = useState('');
  const [editingSectionId, setEditingSectionId] = useState(null);
  const [sectionDraft, setSectionDraft] = useState({ label: '', bar: 1 });

  useEffect(() => {
    let cancelled = false;

    const loadSetlist = async () => {
      setLoadingSetlist(true);
      setSetlistError('');
      try {
        const eventSnap = await getDoc(doc(db, 'eventos', eventoId));
        if (!eventSnap.exists()) throw new Error('El evento no existe.');
        const eventData = eventSnap.data();
        const songIds = [...new Set(getEventSongIds(eventData))];
        const songSnaps = await Promise.all(songIds.map((songId) => getDoc(doc(db, 'canciones', songId))));
        const map = {};
        songSnaps.forEach((snap) => {
          if (snap.exists()) map[snap.id] = { id: snap.id, ...snap.data() };
        });

        if (!cancelled) {
          setEvento(eventData);
          setSongsById(map);
        }
      } catch (error) {
        if (!cancelled) setSetlistError(error?.message || 'No se pudo cargar el setlist.');
      } finally {
        if (!cancelled) setLoadingSetlist(false);
      }
    };

    loadSetlist();
    return () => { cancelled = true; };
  }, [eventoId]);

  const playlist = useMemo(() => {
    if (!evento) return [];
    return getEventSetlistItems(evento)
      .filter((item) => item.type === 'song')
      .map((item, index) => {
        const song = songsById[item.value];
        if (!song) return null;
        return {
          ...song,
          setlistItemId: item.idLocal || `${item.value}_${index}`,
        };
      })
      .filter(Boolean);
  }, [evento, songsById]);

  const currentSong = playlist[currentIndex] || null;

  useEffect(() => {
    if (currentIndex < playlist.length) return;
    setCurrentIndex(Math.max(0, playlist.length - 1));
  }, [currentIndex, playlist.length]);

  useEffect(() => {
    let cancelled = false;

    if (playlist.length === 0) {
      setReadiness(null);
      setCheckingReadiness(false);
      return undefined;
    }

    setCheckingReadiness(true);
    getMultitrackSetlistReadiness(playlist)
      .then((result) => {
        if (!cancelled) setReadiness(result);
      })
      .catch((error) => {
        if (!cancelled) {
          setReadiness({
            supported: isMultitrackCacheSupported(),
            error: error?.message || 'No se pudo revisar la preparación local.',
            songs: [],
          });
        }
      })
      .finally(() => {
        if (!cancelled) setCheckingReadiness(false);
      });

    return () => { cancelled = true; };
  }, [playlist]);

  useEffect(() => {
    if (!currentSong) {
      engineRef.current.stop();
      setPlayback(EMPTY_PLAYBACK);
      return undefined;
    }

    let cancelled = false;
    setLoadingAudio(true);
    setAudioError('');
    setLoopError('');
    setStemErrors([]);
    setLoadProgress({ completed: 0, total: getSongAudioCount(currentSong), cacheHits: 0 });
    setPlayback(EMPTY_PLAYBACK);

    engineRef.current.loadSong(currentSong, (progress) => {
      if (!cancelled) setLoadProgress(progress);
    }).then((result) => {
      if (cancelled || result?.cancelled) return;
      setStemErrors(result.errors || []);
      setPlayback(engineRef.current.getState());

      getMultitrackSetlistReadiness(playlist)
        .then((nextReadiness) => {
          if (!cancelled) setReadiness(nextReadiness);
        })
        .catch(() => {});
    }).catch((error) => {
      if (!cancelled) setAudioError(error?.message || 'No se pudo preparar el audio.');
    }).finally(() => {
      if (!cancelled) setLoadingAudio(false);
    });

    return () => {
      cancelled = true;
      engineRef.current.stop();
    };
  }, [currentSong?.setlistItemId, playlist]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const engine = engineRef.current;
      if (engine.isFinished()) engine.pause();
      setPlayback(engine.getState());
    }, 80);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => () => {
    engineRef.current?.dispose();
  }, []);

  const durationSpread = useMemo(() => {
    if (playback.stems.length < 2) return 0;
    const values = playback.stems.map((stem) => stem.duration);
    return Math.max(...values) - Math.min(...values);
  }, [playback.stems]);

  const readinessByKey = useMemo(() => new Map(
    (readiness?.songs || []).map((song) => [String(song.key), song])
  ), [readiness]);

  const currentSongGridKey = String(currentSong?.id || currentSong?.setlistItemId || '');
  const currentBpm = Number(currentSong?.bpm) || 0;
  const currentBeatsPerBar = Math.max(1, Math.min(16, Math.round(
    Number(
      currentSong?.playbackConfig?.timeSignature?.[0]
      || currentSong?.playbackConfig?.beatsPerBar
      || currentSong?.beatsPerBar
      || 4
    ) || 4
  )));
  const currentGridOffset = Number(gridOffsets[currentSongGridKey]) || 0;
  const musicalPosition = useMemo(() => getMusicalPosition({
    time: playback.currentTime,
    bpm: currentBpm,
    beatsPerBar: currentBeatsPerBar,
    gridOffsetSeconds: currentGridOffset,
  }), [playback.currentTime, currentBpm, currentBeatsPerBar, currentGridOffset]);

  const currentSections = useMemo(() => (
    Array.isArray(sectionsBySong[currentSongGridKey]) ? sectionsBySong[currentSongGridKey] : []
  ), [sectionsBySong, currentSongGridKey]);

  const togglePlay = async () => {
    if (loadingAudio || audioError || playback.stems.length === 0) return;
    if (engineRef.current.getState().playing) engineRef.current.pause();
    else await engineRef.current.play();
    setPlayback(engineRef.current.getState());
  };

  const stopPlayback = () => {
    engineRef.current.stop();
    setPlayback(engineRef.current.getState());
  };

  const seekPlayback = async (event) => {
    await engineRef.current.seek(Number(event.target.value));
    setPlayback(engineRef.current.getState());
  };

  const changeSong = (nextIndex) => {
    if (nextIndex < 0 || nextIndex >= playlist.length || nextIndex === currentIndex) return;
    engineRef.current.stop();
    setCurrentIndex(nextIndex);
  };

  const toggleMute = (stemId) => {
    engineRef.current.toggleStemMute(stemId);
    setPlayback(engineRef.current.getState());
  };

  const toggleSolo = (stemId) => {
    engineRef.current.toggleStemSolo(stemId);
    setPlayback(engineRef.current.getState());
  };

  const changeStemVolume = (stemId, value) => {
    engineRef.current.setStemVolume(stemId, value);
    setPlayback(engineRef.current.getState());
  };

  const changeMasterVolume = (value) => {
    engineRef.current.setMasterVolume(value);
    setPlayback(engineRef.current.getState());
  };

  const markGridStart = () => {
    if (!currentSongGridKey || !currentBpm || playback.stems.length === 0) return;
    if (playback.loop) {
      setPlayback(engineRef.current.cancelLoop());
    }
    setGridOffsets((previous) => ({
      ...previous,
      [currentSongGridKey]: playback.currentTime,
    }));
  };

  const resetGridStart = () => {
    if (!currentSongGridKey) return;
    if (playback.loop) {
      setPlayback(engineRef.current.cancelLoop());
    }
    setGridOffsets((previous) => ({
      ...previous,
      [currentSongGridKey]: 0,
    }));
  };

  const armQuantizedLoop = (bars) => {
    setLoopError('');

    if (!currentBpm || !musicalPosition.valid || playback.stems.length === 0) {
      setLoopError('Configura un BPM válido y carga la canción antes de crear un loop.');
      return;
    }

    const secondsPerBar = musicalPosition.secondsPerBar;
    let start = currentGridOffset;

    if (playback.playing) {
      start = getNextMusicalBoundary({
        time: playback.currentTime,
        bpm: currentBpm,
        beatsPerBar: currentBeatsPerBar,
        gridOffsetSeconds: currentGridOffset,
        boundary: 'bar',
      });
    } else if (playback.currentTime >= currentGridOffset && !musicalPosition.beforeStart) {
      start = currentGridOffset + ((Math.max(1, musicalPosition.bar) - 1) * secondsPerBar);
    }

    const end = start + (Math.max(1, Number(bars) || 1) * secondsPerBar);
    const shortestDuration = Number(playback.shortestStemDuration) || Math.min(...playback.stems.map((stem) => stem.duration));

    if (end > shortestDuration - 0.005) {
      setLoopError('Ese bloque llega más allá del stem más corto. Muévete a un compás anterior o elige menos compases.');
      return;
    }

    try {
      const nextState = engineRef.current.setLoopRegion(start, end, { bars });
      setPlayback(nextState);
    } catch (error) {
      setLoopError(error?.message || 'No se pudo crear el loop.');
    }
  };

  const exitQuantizedLoop = () => {
    setLoopError('');
    try {
      setPlayback(engineRef.current.requestLoopExit());
    } catch (error) {
      setLoopError(error?.message || 'No se pudo salir del loop.');
    }
  };

  const addSectionMarker = (baseLabel) => {
    setSectionError('');

    if (!currentSongGridKey || !currentBpm || !musicalPosition.valid || musicalPosition.beforeStart || playback.stems.length === 0) {
      setSectionError('Reproduce la canción y alinea primero el compás 1 antes de marcar secciones.');
      return;
    }

    const secondsPerBar = musicalPosition.secondsPerBar;
    const bar = Math.max(1, musicalPosition.bar);
    const start = currentGridOffset + ((bar - 1) * secondsPerBar);
    const sameBaseCount = currentSections.filter((section) => section.baseLabel === baseLabel).length;
    const label = sameBaseCount > 0 ? baseLabel + ' ' + (sameBaseCount + 1) : baseLabel;
    const nextMarker = {
      id: String(Date.now()) + '-' + Math.random().toString(36).slice(2, 8),
      label,
      baseLabel,
      bar,
      start,
    };

    setSectionsBySong((previous) => {
      const current = Array.isArray(previous[currentSongGridKey]) ? previous[currentSongGridKey] : [];
      const withoutSameBar = current.filter((section) => Math.abs(section.start - start) > 0.03);
      return {
        ...previous,
        [currentSongGridKey]: [...withoutSameBar, nextMarker].sort((a, b) => a.start - b.start),
      };
    });
  };

  const removeSectionMarker = (sectionId) => {
    setSectionError('');
    if (!currentSongGridKey) return;
    setSectionsBySong((previous) => ({
      ...previous,
      [currentSongGridKey]: (previous[currentSongGridKey] || []).filter((section) => section.id !== sectionId),
    }));
  };

  const goToSection = async (section) => {
    setSectionError('');
    try {
      await engineRef.current.seek(section.start);
      setPlayback(engineRef.current.getState());
    } catch (error) {
      setSectionError(error?.message || 'No se pudo ir a esa sección.');
    }
  };

  const loopSection = async (sectionIndex) => {
    setSectionError('');
    const section = currentSections[sectionIndex];
    const nextSection = currentSections[sectionIndex + 1];

    if (!section || !nextSection) {
      setSectionError('Para repetir una sección necesitas haber marcado también la sección que viene después.');
      return;
    }

    try {
      await engineRef.current.seek(section.start);
      const bars = Math.max(1, Math.round((nextSection.start - section.start) / musicalPosition.secondsPerBar));
      const nextState = engineRef.current.setLoopRegion(section.start, nextSection.start, { bars });
      setPlayback(nextState);
    } catch (error) {
      setSectionError(error?.message || 'No se pudo repetir esa sección.');
    }
  };
  const beginEditSection = (section) => {
    setSectionError('');
    setEditingSectionId(section.id);
    setSectionDraft({ label: section.label, bar: section.bar });
  };

  const cancelEditSection = () => {
    setEditingSectionId(null);
    setSectionDraft({ label: '', bar: 1 });
  };

  const adjustDraftBar = (delta) => {
    setSectionDraft((previous) => ({
      ...previous,
      bar: Math.max(1, (Number(previous.bar) || 1) + delta),
    }));
  };

  const saveSectionEdit = (sectionId) => {
    setSectionError('');
    const label = String(sectionDraft.label || '').trim();
    const bar = Math.max(1, Math.round(Number(sectionDraft.bar) || 1));

    if (!label) {
      setSectionError('Escribe un nombre para la sección.');
      return;
    }

    if (!musicalPosition.secondsPerBar) {
      setSectionError('No se puede recalcular el compás sin un BPM válido.');
      return;
    }

    const start = currentGridOffset + ((bar - 1) * musicalPosition.secondsPerBar);
    const shortestDuration = Number(playback.shortestStemDuration) || Math.min(...playback.stems.map((stem) => stem.duration));

    if (start >= shortestDuration - 0.01) {
      setSectionError('Ese compás está fuera del rango seguro de los stems.');
      return;
    }

    const collides = currentSections.some((section) => section.id !== sectionId && Math.abs(section.start - start) < 0.03);
    if (collides) {
      setSectionError('Ya existe otra sección en ese compás. Elige otro compás.');
      return;
    }

    if (playback.loop) {
      setPlayback(engineRef.current.cancelLoop());
    }

    setSectionsBySong((previous) => ({
      ...previous,
      [currentSongGridKey]: (previous[currentSongGridKey] || []).map((section) =>
        section.id === sectionId ? { ...section, label, bar, start } : section
      ).sort((a, b) => a.start - b.start),
    }));

    cancelEditSection();
  };

  const handlePrepareSetlist = async () => {
    if (preparingSetlist || playlist.length === 0 || !isMultitrackCacheSupported()) return;

    setPreparingSetlist(true);
    setPrepareSummary(null);
    setPrepareProgress({ completed: 0, total: 0, cached: 0, downloaded: 0, errors: 0 });

    try {
      const result = await prepareMultitrackSetlist(playlist, setPrepareProgress, { concurrency: 3 });
      setPrepareSummary(result);
      const nextReadiness = await getMultitrackSetlistReadiness(playlist);
      setReadiness(nextReadiness);
    } catch (error) {
      setPrepareSummary({ error: error?.message || 'No se pudo preparar el setlist.' });
    } finally {
      setPreparingSetlist(false);
    }
  };

  if (loadingSetlist) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-6">
        <div className="text-center">
          <Loader2 className="mx-auto mb-4 animate-spin text-emerald-400" size={38} />
          <p className="text-sm font-black uppercase tracking-[0.18em] text-zinc-400">Preparando Multitrack Live</p>
        </div>
      </div>
    );
  }

  if (setlistError) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-6">
        <div className="w-full max-w-xl rounded-3xl border border-red-500/25 bg-red-500/10 p-7 text-center">
          <AlertTriangle className="mx-auto mb-4 text-red-300" size={36} />
          <h1 className="text-2xl font-black">No se pudo abrir Multitrack Live</h1>
          <p className="mt-3 text-sm font-semibold text-red-100/70">{setlistError}</p>
          <button type="button" onClick={() => navigate(`/setlist/${eventoId}`)} className="mt-6 rounded-2xl bg-white px-5 py-3 text-sm font-black text-zinc-950">
            Volver al setlist
          </button>
        </div>
      </div>
    );
  }

  const cacheSupported = isMultitrackCacheSupported();
  const prepareHasErrors = Boolean(prepareSummary?.error || prepareSummary?.errors?.length);
  const readyForLive = Boolean(
    cacheSupported
    && readiness?.songsWithAudio > 0
    && readiness?.pendingAudio === 0
    && readiness?.readySongs === readiness?.songsWithAudio
  );

  return (
    <div className="min-h-screen bg-[#050608] text-zinc-100">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#050608]/95 px-3 py-3 backdrop-blur md:px-5">
        <div className="mx-auto flex max-w-[1800px] flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <button type="button" onClick={() => navigate(`/setlist/${eventoId}`)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10 hover:text-white" title="Volver al setlist">
              <ArrowLeft size={18} />
            </button>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-300">
              <Radio size={20} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="truncate text-base font-black md:text-lg">Multitrack Live</p>
                <span className="rounded-full border border-amber-400/25 bg-amber-400/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-amber-200">Fase 2D</span>
              </div>
              <p className="truncate text-[11px] font-semibold text-zinc-500">{evento?.titulo || 'Setlist'} · Operador: {user?.nombre || 'Usuario'}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={handlePrepareSetlist}
              disabled={!cacheSupported || preparingSetlist || playlist.length === 0}
              title={cacheSupported ? 'Descarga los audios del setlist para evitar depender de la red durante el servicio.' : 'Este dispositivo no soporta la preparación local de audios.'}
              className={`flex items-center gap-2 rounded-2xl border px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${readyForLive ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200' : prepareHasErrors ? 'border-amber-400/30 bg-amber-400/10 text-amber-200' : 'border-violet-400/25 bg-violet-400/10 text-violet-200 hover:bg-violet-400/15'}`}
            >
              {preparingSetlist ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              {preparingSetlist
                ? `Preparando ${prepareProgress.completed}/${prepareProgress.total || '...'}`
                : readyForLive
                  ? 'Setlist preparado'
                  : 'Preparar setlist'}
            </button>
            <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2">
              <div className={`h-2.5 w-2.5 rounded-full ${playback.playing ? 'bg-emerald-400 shadow-[0_0_14px_rgba(52,211,153,.9)]' : 'bg-zinc-600'}`} />
              <span className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-400">{playback.playing ? 'Reproduciendo' : loadingAudio ? 'Cargando' : 'Listo'}</span>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1800px] px-3 pt-3 md:px-5 md:pt-4">
        <div className={`rounded-2xl border px-4 py-3 ${readyForLive ? 'border-emerald-400/25 bg-emerald-400/[0.07]' : 'border-amber-400/20 bg-amber-400/[0.05]'}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              {checkingReadiness ? (
                <Loader2 size={18} className="shrink-0 animate-spin text-blue-300" />
              ) : readyForLive ? (
                <CheckCircle2 size={18} className="shrink-0 text-emerald-300" />
              ) : (
                <AlertTriangle size={18} className="shrink-0 text-amber-300" />
              )}
              <div className="min-w-0">
                <p className={`text-xs font-black ${readyForLive ? 'text-emerald-100' : 'text-zinc-200'}`}>
                  {checkingReadiness
                    ? 'Revisando preparación Live…'
                    : readiness?.error
                      ? 'No se pudo comprobar la preparación local'
                      : !cacheSupported
                        ? 'Preparación local no disponible en este dispositivo'
                        : readyForLive
                          ? 'Setlist listo para Live'
                          : 'Setlist pendiente de preparación'}
                </p>
                <p className="mt-1 text-[10px] font-semibold text-zinc-500">
                  {readiness?.error
                    ? readiness.error
                    : readiness
                      ? `${readiness.readySongs || 0}/${readiness.songsWithAudio || 0} canciones con audio preparadas · ${readiness.cachedAudio || 0}/${readiness.totalAudio || 0} audios locales${readiness.noAudioSongs ? ` · ${readiness.noAudioSongs} canción(es) sin audio` : ''}`
                      : 'Kadosh comprobará qué canciones están listas para trabajar sin depender de la red.'}
                </p>
              </div>
            </div>
            {readiness && !readiness.error && (
              <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-wide">
                <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-1 text-emerald-300">Listas {readiness.readySongs || 0}</span>
                {(readiness.partialSongs || 0) > 0 && <span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-2 py-1 text-amber-300">Parciales {readiness.partialSongs}</span>}
                {(readiness.pendingSongs || 0) > 0 && <span className="rounded-full border border-violet-400/20 bg-violet-400/10 px-2 py-1 text-violet-300">Pendientes {readiness.pendingSongs}</span>}
              </div>
            )}
          </div>
        </div>
      </div>

      {(preparingSetlist || prepareSummary) && (
        <div className="mx-auto max-w-[1800px] px-3 pt-3 md:px-5 md:pt-4">
          <div className={`rounded-2xl border px-4 py-3 ${prepareHasErrors ? 'border-amber-400/20 bg-amber-400/[0.06]' : 'border-emerald-400/20 bg-emerald-400/[0.06]'}`}>
            {preparingSetlist ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-black text-zinc-200">Preparando audios del setlist para uso local</p>
                <p className="font-mono text-[10px] font-bold text-zinc-500">{prepareProgress.completed}/{prepareProgress.total || 0} · caché {prepareProgress.cached} · descargados {prepareProgress.downloaded}</p>
              </div>
            ) : prepareSummary?.error ? (
              <p className="text-xs font-bold text-amber-200">{prepareSummary.error}</p>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-black text-emerald-200">{prepareSummary.ready} de {prepareSummary.total} audios preparados localmente.</p>
                <p className="font-mono text-[10px] font-bold text-zinc-500">ya estaban {prepareSummary.cached} · nuevos {prepareSummary.downloaded} · errores {prepareSummary.errors.length}</p>
              </div>
            )}
          </div>
        </div>
      )}

      <main className="mx-auto grid max-w-[1800px] gap-3 p-3 md:gap-4 md:p-5 xl:grid-cols-[280px_minmax(0,1fr)_360px]">
        <aside className="order-2 rounded-3xl border border-white/10 bg-white/[0.035] p-3 xl:order-1 xl:sticky xl:top-[82px] xl:h-[calc(100vh-102px)] xl:overflow-hidden">
          <div className="mb-3 flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <ListMusic size={16} className="text-violet-300" />
              <h2 className="text-xs font-black uppercase tracking-[0.16em] text-zinc-300">Setlist</h2>
            </div>
            <span className="text-[10px] font-bold text-zinc-600">{playlist.length} canciones</span>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1 xl:h-[calc(100%-32px)] xl:flex-col xl:overflow-y-auto xl:overflow-x-hidden xl:pr-1">
            {playlist.map((song, index) => {
              const count = getSongAudioCount(song);
              const active = index === currentIndex;
              const songReadiness = readinessByKey.get(String(song.setlistItemId));
              const ready = songReadiness?.status === 'ready';
              const partial = songReadiness?.status === 'partial';
              return (
                <button
                  key={song.setlistItemId}
                  type="button"
                  onClick={() => changeSong(index)}
                  className={`min-w-[230px] rounded-2xl border p-3 text-left transition-all xl:min-w-0 ${active ? 'border-emerald-400/40 bg-emerald-400/10 shadow-[0_0_25px_rgba(16,185,129,.08)]' : 'border-white/8 bg-black/20 hover:border-white/20 hover:bg-white/[0.04]'}`}
                >
                  <div className="flex items-start gap-3">
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[10px] font-black ${active ? 'bg-emerald-400 text-zinc-950' : 'bg-white/8 text-zinc-500'}`}>{index + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className={`truncate text-sm font-black ${active ? 'text-white' : 'text-zinc-300'}`}>{song.titulo}</p>
                      <p className="mt-1 truncate text-[10px] font-semibold text-zinc-600">{song.artista || 'Sin artista'} · {song.bpm || '--'} BPM</p>
                      <div className="mt-2 flex items-center gap-1.5">
                        {count === 0 ? (
                          <>
                            <AlertTriangle size={12} className="text-amber-300" />
                            <span className="text-[9px] font-black uppercase tracking-wide text-amber-300/80">Sin audio</span>
                          </>
                        ) : ready ? (
                          <>
                            <CheckCircle2 size={12} className="text-emerald-400" />
                            <span className="text-[9px] font-black uppercase tracking-wide text-emerald-400/80">Preparada · {songReadiness.cached}/{songReadiness.total} local</span>
                          </>
                        ) : partial ? (
                          <>
                            <AlertTriangle size={12} className="text-amber-300" />
                            <span className="text-[9px] font-black uppercase tracking-wide text-amber-300/80">Parcial · {songReadiness.cached}/{songReadiness.total} local</span>
                          </>
                        ) : (
                          <>
                            <AlertTriangle size={12} className="text-violet-300" />
                            <span className="text-[9px] font-black uppercase tracking-wide text-violet-300/80">Pendiente · {count} audio{count === 1 ? '' : 's'}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="order-1 min-w-0 space-y-3 xl:order-2">
          <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-zinc-900 to-black p-4 shadow-2xl shadow-black/30 md:p-6">
            {currentSong ? (
              <>
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-400">Canción {currentIndex + 1} de {playlist.length}</p>
                    <h1 className="mt-1 truncate text-3xl font-black tracking-tight text-white md:text-5xl">{currentSong.titulo}</h1>
                    <p className="mt-2 text-sm font-semibold text-zinc-500">{currentSong.artista || 'Sin artista'} · {currentSong.bpm || '--'} BPM · Tono {currentSong.tonoOriginal || currentSong.tono || '--'}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-right">
                    <p className="font-mono text-2xl font-black tabular-nums text-white md:text-3xl">{formatTime(playback.currentTime)}</p>
                    <p className="mt-1 font-mono text-[10px] font-bold text-zinc-600">de {formatTime(playback.duration)}</p>
                  </div>
                </div>

                <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
                  <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/[0.05] p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-300">Reloj musical</p>
                        <p className="mt-1 text-[10px] font-semibold text-zinc-500">Base para compases, secciones y loops cuantizados.</p>
                      </div>
                      <span className="rounded-full border border-white/10 bg-black/25 px-2.5 py-1 font-mono text-[10px] font-black text-zinc-400">{currentBeatsPerBar}/4</span>
                    </div>

                    {currentBpm > 0 ? (
                      <>
                        <div className="mt-4 grid grid-cols-3 gap-2">
                          <div className="rounded-xl border border-white/8 bg-black/25 p-3 text-center">
                            <p className="text-[9px] font-black uppercase tracking-widest text-zinc-600">Compás</p>
                            <p className="mt-1 font-mono text-2xl font-black text-white">{musicalPosition.beforeStart ? 'PRE' : musicalPosition.bar}</p>
                          </div>
                          <div className="rounded-xl border border-white/8 bg-black/25 p-3 text-center">
                            <p className="text-[9px] font-black uppercase tracking-widest text-zinc-600">Beat</p>
                            <p className="mt-1 font-mono text-2xl font-black text-cyan-200">{musicalPosition.beforeStart ? '--' : musicalPosition.beat}<span className="text-xs text-zinc-600">/{currentBeatsPerBar}</span></p>
                          </div>
                          <div className="rounded-xl border border-white/8 bg-black/25 p-3 text-center">
                            <p className="text-[9px] font-black uppercase tracking-widest text-zinc-600">BPM</p>
                            <p className="mt-1 font-mono text-2xl font-black text-white">{currentBpm}</p>
                          </div>
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-1.5">
                          {Array.from({ length: currentBeatsPerBar }, (_, beatIndex) => {
                            const activeBeat = !musicalPosition.beforeStart && musicalPosition.beat === beatIndex + 1;
                            return (
                              <span
                                key={beatIndex}
                                className={'h-2.5 flex-1 rounded-full transition-colors ' + (activeBeat ? 'bg-cyan-300' : 'bg-zinc-800')}
                              />
                            );
                          })}
                        </div>
                      </>
                    ) : (
                      <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] p-3 text-xs font-bold text-amber-200">
                        Esta canción no tiene BPM configurado. El reloj musical queda desactivado hasta definirlo.
                      </div>
                    )}
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-400">Alineación</p>
                    <p className="mt-2 text-[10px] font-semibold leading-relaxed text-zinc-600">Marca el instante exacto donde comienza el compás 1. Por ahora esta referencia vive solo durante esta sesión.</p>
                    <p className="mt-3 font-mono text-xs font-black text-zinc-300">Inicio: {formatTime(currentGridOffset)}</p>
                    <div className="mt-3 grid gap-2">
                      <button
                        type="button"
                        onClick={markGridStart}
                        disabled={!currentBpm || playback.stems.length === 0}
                        className="rounded-xl bg-cyan-400 px-3 py-2.5 text-[10px] font-black uppercase tracking-wide text-zinc-950 hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-600"
                      >
                        Marcar compás 1 aquí
                      </button>
                      <button
                        type="button"
                        onClick={resetGridStart}
                        disabled={!currentSongGridKey || currentGridOffset === 0}
                        className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-[10px] font-black uppercase tracking-wide text-zinc-400 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        Reiniciar a 0:00
                      </button>
                    </div>
                  </div>
                </div>

                <div className="mt-3 rounded-2xl border border-fuchsia-400/20 bg-fuchsia-400/[0.045] p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-fuchsia-300">Loop cuantizado</p>
                        {playback.loop && (
                          <span className={'rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-widest ' + (playback.loop.phase === 'active' ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200' : playback.loop.phase === 'armed' ? 'border-cyan-400/30 bg-cyan-400/10 text-cyan-200' : 'border-amber-400/30 bg-amber-400/10 text-amber-200')}>
                            {playback.loop.phase === 'active' ? 'Loop activo' : playback.loop.phase === 'armed' ? 'Armado' : 'Saliendo'}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-[10px] font-semibold text-zinc-500">Mientras reproduce, el bloque se arma desde el próximo compás. Todos los stems usan el mismo rango del motor.</p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {[1, 2, 4, 8].map((bars) => (
                        <button
                          key={bars}
                          type="button"
                          onClick={() => armQuantizedLoop(bars)}
                          disabled={!currentBpm || playback.stems.length === 0 || Boolean(playback.loop)}
                          className="min-w-[54px] rounded-xl border border-fuchsia-400/20 bg-fuchsia-400/10 px-3 py-2 text-[10px] font-black text-fuchsia-100 hover:bg-fuchsia-400/20 disabled:cursor-not-allowed disabled:opacity-30"
                        >
                          {bars} {bars === 1 ? 'compás' : 'compases'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {playback.loop && (
                    <div className="mt-4 flex flex-col gap-3 rounded-xl border border-white/8 bg-black/25 p-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-xs font-black text-zinc-200">{playback.loop.bars} {playback.loop.bars === 1 ? 'compás' : 'compases'} · {formatTime(playback.loop.start)} → {formatTime(playback.loop.end)}</p>
                        <p className="mt-1 text-[10px] font-semibold text-zinc-600">{playback.loop.phase === 'armed' ? 'Entrará al loop cuando llegue al próximo compás.' : playback.loop.phase === 'exiting' ? 'La salida está cuantizada para no cortar el bloque a la mitad.' : 'El bloque se repetirá hasta que ordenes salir.'}</p>
                      </div>
                      <button
                        type="button"
                        onClick={exitQuantizedLoop}
                        disabled={playback.loop.phase === 'exiting'}
                        className="rounded-xl border border-amber-400/25 bg-amber-400/10 px-4 py-2.5 text-[10px] font-black uppercase tracking-wide text-amber-100 hover:bg-amber-400/20 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {playback.loop.phase === 'armed' ? 'Cancelar loop' : playback.loop.phase === 'exiting' ? 'Salida programada' : 'Salir del loop'}
                      </button>
                    </div>
                  )}

                  {loopError && (
                    <div className="mt-3 flex gap-2 rounded-xl border border-red-400/20 bg-red-400/[0.07] p-3 text-red-200">
                      <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                      <p className="text-[10px] font-bold leading-relaxed">{loopError}</p>
                    </div>
                  )}

                  <p className="mt-3 text-[9px] font-semibold text-zinc-700">Mover la línea de tiempo o pulsar Stop cancela el loop por seguridad.</p>
                </div>

                <div className="mt-3 rounded-2xl border border-violet-400/20 bg-violet-400/[0.045] p-4">
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-300">Secciones Live</p>
                      <p className="mt-1 text-[10px] font-semibold leading-relaxed text-zinc-500">Hazlo simple: cuando llegues al inicio de una parte, toca su nombre. Kadosh recordará ese punto durante esta sesión.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {['Intro', 'Verso', 'Pre-coro', 'Coro', 'Puente', 'Instrumental', 'Final'].map((label) => (
                        <button
                          key={label}
                          type="button"
                          onClick={() => addSectionMarker(label)}
                          disabled={!currentBpm || playback.stems.length === 0 || musicalPosition.beforeStart}
                          className="rounded-xl border border-violet-400/20 bg-violet-400/10 px-3 py-2 text-[10px] font-black text-violet-100 hover:bg-violet-400/20 disabled:cursor-not-allowed disabled:opacity-30"
                        >
                          + {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {currentSections.length > 0 ? (
                    <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                      {currentSections.map((section, sectionIndex) => (
                        <div key={section.id} className="rounded-xl border border-white/8 bg-black/25 p-3">
                          {editingSectionId === section.id ? (
                            <div className="space-y-3">
                              <div>
                                <label className="text-[9px] font-black uppercase tracking-widest text-zinc-600">Nombre</label>
                                <input
                                  type="text"
                                  value={sectionDraft.label}
                                  onChange={(event) => setSectionDraft((previous) => ({ ...previous, label: event.target.value }))}
                                  className="mt-1 w-full rounded-lg border border-white/10 bg-black/35 px-3 py-2 text-xs font-bold text-white outline-none focus:border-violet-400/40"
                                  placeholder="Nombre de sección"
                                />
                              </div>
                              <div>
                                <label className="text-[9px] font-black uppercase tracking-widest text-zinc-600">Compás de inicio</label>
                                <div className="mt-1 grid grid-cols-[38px_minmax(0,1fr)_38px] gap-2">
                                  <button type="button" onClick={() => adjustDraftBar(-1)} className="rounded-lg border border-white/10 bg-white/5 text-lg font-black text-zinc-300 hover:bg-white/10">−</button>
                                  <input
                                    type="number"
                                    min="1"
                                    step="1"
                                    value={sectionDraft.bar}
                                    onChange={(event) => setSectionDraft((previous) => ({ ...previous, bar: event.target.value }))}
                                    className="w-full rounded-lg border border-white/10 bg-black/35 px-3 py-2 text-center font-mono text-xs font-black text-white outline-none focus:border-cyan-400/40"
                                  />
                                  <button type="button" onClick={() => adjustDraftBar(1)} className="rounded-lg border border-white/10 bg-white/5 text-lg font-black text-zinc-300 hover:bg-white/10">+</button>
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <button type="button" onClick={cancelEditSection} className="rounded-lg border border-white/10 bg-white/5 px-2 py-2 text-[9px] font-black uppercase tracking-wide text-zinc-400 hover:bg-white/10">Cancelar</button>
                                <button type="button" onClick={() => saveSectionEdit(section.id)} className="rounded-lg bg-emerald-400 px-2 py-2 text-[9px] font-black uppercase tracking-wide text-zinc-950 hover:bg-emerald-300">Guardar cambios</button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="truncate text-xs font-black text-zinc-100">{section.label}</p>
                                  <p className="mt-1 font-mono text-[9px] font-bold text-zinc-600">Compás {section.bar} · {formatTime(section.start)}</p>
                                </div>
                                <div className="flex items-center gap-1">
                                  <button type="button" onClick={() => beginEditSection(section)} className="rounded-lg border border-white/10 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-zinc-500 hover:bg-white/5 hover:text-zinc-200">Editar</button>
                                  <button type="button" onClick={() => removeSectionMarker(section.id)} className="rounded-lg border border-white/10 px-2 py-1 text-[10px] font-black text-zinc-600 hover:bg-white/5 hover:text-zinc-300" title="Eliminar sección">×</button>
                                </div>
                              </div>
                              <div className="mt-3 grid grid-cols-2 gap-2">
                                <button type="button" onClick={() => goToSection(section)} className="rounded-lg border border-cyan-400/20 bg-cyan-400/10 px-2 py-2 text-[9px] font-black uppercase tracking-wide text-cyan-200 hover:bg-cyan-400/20">Ir</button>
                                <button
                                  type="button"
                                  onClick={() => loopSection(sectionIndex)}
                                  disabled={sectionIndex >= currentSections.length - 1}
                                  className="rounded-lg border border-fuchsia-400/20 bg-fuchsia-400/10 px-2 py-2 text-[9px] font-black uppercase tracking-wide text-fuchsia-200 hover:bg-fuchsia-400/20 disabled:cursor-not-allowed disabled:opacity-30"
                                >
                                  Loop
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-4 rounded-xl border border-dashed border-white/10 p-4 text-center text-[10px] font-semibold text-zinc-600">
                      Todavía no hay secciones. Reproduce la canción y pulsa “+ Intro”, “+ Verso”, “+ Coro”… justo cuando empiece cada parte.
                    </div>
                  )}

                  {sectionError && (
                    <div className="mt-3 flex gap-2 rounded-xl border border-red-400/20 bg-red-400/[0.07] p-3 text-red-200">
                      <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                      <p className="text-[10px] font-bold leading-relaxed">{sectionError}</p>
                    </div>
                  )}
                </div>

                <div className="mt-7">
                  <input
                    type="range"
                    min="0"
                    max={playback.duration || 1}
                    step="0.01"
                    value={Math.min(playback.currentTime, playback.duration || 0)}
                    onChange={seekPlayback}
                    disabled={loadingAudio || playback.duration <= 0}
                    className="h-3 w-full cursor-pointer appearance-none rounded-full bg-zinc-800 accent-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
                  />
                  <div className="mt-2 flex justify-between font-mono text-[10px] font-bold text-zinc-600">
                    <span>{formatTime(playback.currentTime)}</span>
                    <span>{formatTime(playback.duration)}</span>
                  </div>
                </div>

                <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                  <button type="button" onClick={() => changeSong(currentIndex - 1)} disabled={currentIndex === 0} className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10 disabled:opacity-25">
                    <SkipBack size={21} />
                  </button>
                  <button type="button" onClick={stopPlayback} disabled={loadingAudio || playback.stems.length === 0} className="flex h-12 w-12 items-center justify-center rounded-2xl border border-red-400/20 bg-red-400/10 text-red-200 hover:bg-red-400/20 disabled:opacity-25" title="Stop">
                    <Square size={18} fill="currentColor" />
                  </button>
                  <button type="button" onClick={togglePlay} disabled={loadingAudio || Boolean(audioError) || playback.stems.length === 0} className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-400 text-zinc-950 shadow-[0_0_40px_rgba(52,211,153,.22)] transition-transform hover:bg-emerald-300 active:scale-95 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-500">
                    {loadingAudio ? <Loader2 size={30} className="animate-spin" /> : playback.playing ? <Pause size={31} fill="currentColor" /> : <Play size={31} fill="currentColor" className="ml-1" />}
                  </button>
                  <button type="button" onClick={() => changeSong(currentIndex + 1)} disabled={currentIndex >= playlist.length - 1} className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10 disabled:opacity-25">
                    <SkipForward size={21} />
                  </button>
                </div>

                {loadingAudio && (
                  <div className="mt-6 rounded-2xl border border-blue-400/20 bg-blue-400/10 p-4">
                    <div className="flex items-center gap-3">
                      <Loader2 size={18} className="animate-spin text-blue-300" />
                      <div>
                        <p className="text-xs font-black text-blue-100">Decodificando audio para reproducción sincronizada</p>
                        <p className="mt-1 text-[10px] font-bold text-blue-200/60">{loadProgress.completed} de {loadProgress.total || getSongAudioCount(currentSong)} archivos preparados{loadProgress.cacheHits ? ` · ${loadProgress.cacheHits} desde almacenamiento local` : ''}</p>
                      </div>
                    </div>
                  </div>
                )}

                {audioError && (
                  <div className="mt-6 flex gap-3 rounded-2xl border border-red-400/25 bg-red-400/10 p-4 text-red-100">
                    <AlertTriangle size={20} className="shrink-0 text-red-300" />
                    <div>
                      <p className="text-xs font-black">No se pudo preparar esta canción</p>
                      <p className="mt-1 text-[11px] font-semibold text-red-100/65">{audioError}</p>
                    </div>
                  </div>
                )}

                {stemErrors.length > 0 && !audioError && (
                  <div className="mt-6 flex gap-3 rounded-2xl border border-amber-400/25 bg-amber-400/10 p-4 text-amber-100">
                    <AlertTriangle size={20} className="shrink-0 text-amber-300" />
                    <div>
                      <p className="text-xs font-black">La canción cargó con {stemErrors.length} track(s) omitido(s)</p>
                      <p className="mt-1 text-[10px] font-semibold text-amber-100/60">{stemErrors.map((item) => item.name).join(', ')}</p>
                    </div>
                  </div>
                )}

                {durationSpread > 0.12 && (
                  <div className="mt-3 flex gap-3 rounded-2xl border border-amber-400/20 bg-amber-400/5 p-3 text-amber-200/80">
                    <AlertTriangle size={16} className="shrink-0" />
                    <p className="text-[10px] font-bold">Los stems no tienen exactamente la misma duración. Diferencia detectada: {durationSpread.toFixed(2)} s. Revisa los archivos antes de usar esta canción en vivo.</p>
                  </div>
                )}
              </>
            ) : (
              <div className="py-20 text-center">
                <Music2 className="mx-auto text-zinc-700" size={44} />
                <h1 className="mt-4 text-2xl font-black">Este setlist no tiene canciones</h1>
                <p className="mt-2 text-sm font-semibold text-zinc-600">Agrega canciones al evento y vuelve a intentarlo.</p>
              </div>
            )}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-4">
              <div className="flex items-center gap-2 text-zinc-300">
                <Headphones size={17} className="text-emerald-300" />
                <h3 className="text-xs font-black uppercase tracking-[0.16em]">Motor sincronizado</h3>
              </div>
              <p className="mt-3 text-xs font-semibold leading-relaxed text-zinc-500">Los stems cargados se disparan contra el mismo reloj de Web Audio. Esta pantalla no reutiliza el reproductor de ensayo ni modifica su comportamiento.</p>
            </div>
            <div className="rounded-3xl border border-dashed border-violet-400/20 bg-violet-400/[0.04] p-4">
              <div className="flex items-center gap-2 text-violet-200">
                <SlidersHorizontal size={17} />
                <h3 className="text-xs font-black uppercase tracking-[0.16em]">Preparación Live</h3>
              </div>
              <p className="mt-3 text-xs font-semibold leading-relaxed text-zinc-500">Usa “Preparar setlist” antes del servicio. Kadosh guarda los archivos comprimidos localmente; al abrir una canción solo queda decodificarlos manteniendo el motor sincronizado.</p>
            </div>
          </div>
        </section>

        <aside className="order-3 rounded-3xl border border-white/10 bg-white/[0.035] p-3 xl:sticky xl:top-[82px] xl:h-[calc(100vh-102px)] xl:overflow-hidden">
          <div className="mb-3 flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <SlidersHorizontal size={16} className="text-blue-300" />
              <h2 className="text-xs font-black uppercase tracking-[0.16em] text-zinc-300">Mixer</h2>
            </div>
            <span className="text-[10px] font-bold text-zinc-600">{playback.stems.length} stems</span>
          </div>

          <div className="mb-3 rounded-2xl border border-white/10 bg-black/25 p-3">
            <div className="flex items-center gap-3">
              <Volume2 size={16} className="shrink-0 text-emerald-300" />
              <div className="min-w-0 flex-1">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Master</span>
                  <span className="font-mono text-[10px] font-bold text-zinc-600">{Math.round(playback.masterVolume * 100)}%</span>
                </div>
                <input type="range" min="0" max="1" step="0.01" value={playback.masterVolume} onChange={(event) => changeMasterVolume(Number(event.target.value))} className="h-2 w-full cursor-pointer appearance-none rounded-full bg-zinc-800 accent-emerald-400" />
              </div>
            </div>
          </div>

          <div className="space-y-2 xl:h-[calc(100%-94px)] xl:overflow-y-auto xl:pr-1">
            {playback.stems.map((stem) => (
              <div key={stem.id} className="rounded-2xl border border-white/8 bg-black/25 p-3">
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-black text-zinc-200">{stem.name}</p>
                    <p className="mt-0.5 font-mono text-[9px] font-semibold text-zinc-600">{formatTime(stem.duration)}</p>
                  </div>
                  <button type="button" onClick={() => toggleMute(stem.id)} className={`flex h-9 w-9 items-center justify-center rounded-xl text-[10px] font-black ${stem.muted ? 'bg-red-500 text-white' : 'border border-white/10 bg-white/5 text-zinc-400 hover:bg-white/10'}`} title="Mute">
                    {stem.muted ? <VolumeX size={15} /> : 'M'}
                  </button>
                  <button type="button" onClick={() => toggleSolo(stem.id)} className={`flex h-9 w-9 items-center justify-center rounded-xl text-[10px] font-black ${stem.solo ? 'bg-amber-400 text-zinc-950' : 'border border-white/10 bg-white/5 text-zinc-400 hover:bg-white/10'}`} title="Solo">S</button>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <Volume2 size={13} className="shrink-0 text-zinc-600" />
                  <input type="range" min="0" max="1" step="0.01" value={stem.volume} onChange={(event) => changeStemVolume(stem.id, Number(event.target.value))} className="h-1.5 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-zinc-800 accent-blue-400" />
                  <span className="w-8 text-right font-mono text-[9px] font-bold text-zinc-600">{Math.round(stem.volume * 100)}</span>
                </div>
              </div>
            ))}

            {!loadingAudio && playback.stems.length === 0 && (
              <div className="rounded-2xl border border-dashed border-white/10 p-6 text-center">
                <Music2 className="mx-auto text-zinc-700" size={28} />
                <p className="mt-3 text-xs font-bold text-zinc-600">Selecciona una canción con audio para cargar el mixer.</p>
              </div>
            )}
          </div>
        </aside>
      </main>
    </div>
  );
};

export default MultitrackLive;
