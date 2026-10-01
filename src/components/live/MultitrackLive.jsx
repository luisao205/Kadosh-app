import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
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
  const { eventoId, songId } = useParams();
  const standaloneSongMode = Boolean(songId);
  const liveRunnerMode = !standaloneSongMode;
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
  const [waveformPeaks, setWaveformPeaks] = useState([]);
  const [timelineDragPreview, setTimelineDragPreview] = useState(null);
  const [timelineHistoryPast, setTimelineHistoryPast] = useState([]);
  const [timelineHistoryFuture, setTimelineHistoryFuture] = useState([]);
  const preparationTimelineRef = useRef(null);
  const preparationTimelineDragRef = useRef(null);
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
  const [savingLiveMap, setSavingLiveMap] = useState(false);
  const [liveMapNotice, setLiveMapNotice] = useState('');
  const [navigationNotice, setNavigationNotice] = useState('');
  const [liveTouchPanel, setLiveTouchPanel] = useState('sections');
  const [pendingSectionAction, setPendingSectionAction] = useState(null);
  const sectionTapRef = useRef({ id: '', at: 0 });
  const loopTapRef = useRef({ id: '', at: 0 });
  const pendingActionRunningRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const loadSetlist = async () => {
      setLoadingSetlist(true);
      setSetlistError('');
      try {
        if (standaloneSongMode) {
          const songSnap = await getDoc(doc(db, 'canciones', songId));
          if (!songSnap.exists()) throw new Error('La canción no existe.');
          const song = { id: songSnap.id, ...songSnap.data() };
          if (!cancelled) {
            setEvento({ titulo: 'Editor de Live Map' });
            setSongsById({ [song.id]: song });
          }
        } else {
          const eventSnap = await getDoc(doc(db, 'eventos', eventoId));
          if (!eventSnap.exists()) throw new Error('El evento no existe.');
          const eventData = eventSnap.data();
          const songIds = [...new Set(getEventSongIds(eventData))];
          const songSnaps = await Promise.all(songIds.map((id) => getDoc(doc(db, 'canciones', id))));
          const map = {};
          songSnaps.forEach((snap) => {
            if (snap.exists()) map[snap.id] = { id: snap.id, ...snap.data() };
          });
          if (!cancelled) {
            setEvento(eventData);
            setSongsById(map);
          }
        }
      } catch (error) {
        if (!cancelled) setSetlistError(error?.message || (standaloneSongMode ? 'No se pudo cargar la canción.' : 'No se pudo cargar el setlist.'));
      } finally {
        if (!cancelled) setLoadingSetlist(false);
      }
    };

    loadSetlist();
    return () => { cancelled = true; };
  }, [eventoId, songId, standaloneSongMode]);

  const playlist = useMemo(() => {
    if (standaloneSongMode) {
      const song = songsById[songId];
      return song ? [{ ...song, setlistItemId: 'song_' + song.id }] : [];
    }
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
  }, [standaloneSongMode, songId, evento, songsById]);

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
    setWaveformPeaks([]);
    setTimelineDragPreview(null);
    setTimelineHistoryPast([]);
    setTimelineHistoryFuture([]);
    preparationTimelineDragRef.current = null;

    engineRef.current.loadSong(currentSong, (progress) => {
      if (!cancelled) setLoadProgress(progress);
    }).then((result) => {
      if (cancelled || result?.cancelled) return;
      setStemErrors(result.errors || []);
      engineRef.current.applyMixerPreset(currentSong?.livePlayback?.mixer);
      setWaveformPeaks(engineRef.current.getWaveformPeaks(180));
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
  }, [currentSong?.setlistItemId]);

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
  const currentBpm = Number(currentSong?.livePlayback?.bpm ?? currentSong?.bpm) || 0;
  const currentBeatsPerBar = Math.max(1, Math.min(16, Math.round(
    Number(
      currentSong?.livePlayback?.timeSignature?.beats
      || currentSong?.livePlayback?.timeSignature?.[0]
      || currentSong?.playbackConfig?.timeSignature?.[0]
      || currentSong?.playbackConfig?.beatsPerBar
      || currentSong?.beatsPerBar
      || 4
    ) || 4
  )));
  useEffect(() => {
    if (!currentSongGridKey || !currentSong) return;
    const savedLiveMap = currentSong?.livePlayback;
    if (!savedLiveMap || typeof savedLiveMap !== 'object') return;

    const savedOffset = Math.max(0, Number(savedLiveMap.gridOffsetSeconds) || 0);
    const secondsPerBar = currentBpm > 0 ? (60 / currentBpm) * currentBeatsPerBar : 0;
    const savedSections = Array.isArray(savedLiveMap.sections)
      ? savedLiveMap.sections.map((section, index) => {
        const bar = Math.max(1, Math.round(Number(section?.bar) || 1));
        const calculatedStart = secondsPerBar > 0 ? savedOffset + ((bar - 1) * secondsPerBar) : 0;
        return {
          id: String(section?.id || ('saved-' + index + '-' + bar)),
          label: String(section?.label || section?.baseLabel || ('Sección ' + (index + 1))),
          baseLabel: String(section?.baseLabel || section?.label || 'Sección'),
          bar,
          start: Number.isFinite(Number(section?.start)) ? Number(section.start) : calculatedStart,
        };
      }).sort((a, b) => a.start - b.start)
      : [];

    setGridOffsets((previous) => (
      Object.prototype.hasOwnProperty.call(previous, currentSongGridKey)
        ? previous
        : { ...previous, [currentSongGridKey]: savedOffset }
    ));
    setSectionsBySong((previous) => (
      Object.prototype.hasOwnProperty.call(previous, currentSongGridKey)
        ? previous
        : { ...previous, [currentSongGridKey]: savedSections }
    ));
  }, [currentSong, currentSongGridKey, currentBpm, currentBeatsPerBar]);

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

  const getSectionIndexAtTime = (time) => {
    const value = Number(time) || 0;
    let activeIndex = -1;
    for (let index = 0; index < currentSections.length; index += 1) {
      if (value + 0.025 >= currentSections[index].start) activeIndex = index;
      else break;
    }
    return activeIndex;
  };

  const getSectionEnd = (sectionIndex) => {
    const nextSection = currentSections[sectionIndex + 1];
    if (nextSection) return nextSection.start;
    const safeDuration = Number(playback.shortestStemDuration) || Number(playback.duration) || 0;
    return safeDuration > 0 ? Math.max(currentSections[sectionIndex]?.start || 0, safeDuration - 0.12) : 0;
  };

  const currentSectionIndex = getSectionIndexAtTime(playback.currentTime);
  const currentLiveSection = currentSectionIndex >= 0 ? currentSections[currentSectionIndex] : null;
  const timelineDuration = Math.max(0, Number(playback.shortestStemDuration) || Number(playback.duration) || 0);
  const timelineBars = useMemo(() => {
    if (!currentBpm || timelineDuration <= 0) return [];
    const secondsPerBar = (60 / currentBpm) * currentBeatsPerBar;
    if (!secondsPerBar || timelineDuration <= currentGridOffset) return [];

    const totalBars = Math.max(1, Math.floor((timelineDuration - currentGridOffset) / secondsPerBar) + 1);
    const stride = totalBars > 120 ? Math.ceil(totalBars / 120) : 1;
    const bars = [];

    for (let bar = 1; bar <= totalBars; bar += stride) {
      const time = currentGridOffset + ((bar - 1) * secondsPerBar);
      if (time < 0 || time > timelineDuration) continue;
      bars.push({ bar, time, major: bar === 1 || (bar - 1) % 4 === 0 });
    }
    return bars;
  }, [currentBpm, currentBeatsPerBar, currentGridOffset, timelineDuration]);
  const activeLoopSectionIndex = playback.loop
    ? currentSections.findIndex((section, sectionIndex) => {
      const nextSection = currentSections[sectionIndex + 1];
      if (!nextSection) return false;
      return Math.abs(playback.loop.start - section.start) < 0.03
        && Math.abs(playback.loop.end - nextSection.start) < 0.03;
    })
    : -1;
  const activeLoopSection = activeLoopSectionIndex >= 0 ? currentSections[activeLoopSectionIndex] : null;
  const currentLiveMapSignature = useMemo(() => JSON.stringify({
    bpm: currentBpm,
    beatsPerBar: currentBeatsPerBar,
    gridOffsetSeconds: Number(currentGridOffset.toFixed(3)),
    sections: currentSections.map((section) => ({
      label: String(section.label || ''),
      baseLabel: String(section.baseLabel || section.label || ''),
      bar: Math.max(1, Math.round(Number(section.bar) || 1)),
    })).sort((a, b) => a.bar - b.bar),
    mixer: {
      masterVolume: Number((playback.masterVolume ?? 1).toFixed(3)),
      stems: playback.stems.map((stem) => ({
        id: String(stem.id),
        name: String(stem.name || ''),
        volume: Number((stem.volume ?? 1).toFixed(3)),
        muted: Boolean(stem.muted),
        solo: Boolean(stem.solo),
      })).sort((a, b) => a.id.localeCompare(b.id)),
    },
  }), [currentBpm, currentBeatsPerBar, currentGridOffset, currentSections, playback.masterVolume, playback.stems]);

  const savedLiveMapSignature = useMemo(() => {
    const saved = currentSong?.livePlayback;
    if (!saved || typeof saved !== 'object') return '';
    return JSON.stringify({
      bpm: Number(saved.bpm ?? currentSong?.bpm) || 0,
      beatsPerBar: Math.max(1, Math.min(16, Math.round(Number(saved?.timeSignature?.beats || saved?.timeSignature?.[0] || 4) || 4))),
      gridOffsetSeconds: Number((Math.max(0, Number(saved.gridOffsetSeconds) || 0)).toFixed(3)),
      sections: (Array.isArray(saved.sections) ? saved.sections : []).map((section) => ({
        label: String(section?.label || ''),
        baseLabel: String(section?.baseLabel || section?.label || ''),
        bar: Math.max(1, Math.round(Number(section?.bar) || 1)),
      })).sort((a, b) => a.bar - b.bar),
      mixer: {
        masterVolume: Number((Number(saved?.mixer?.masterVolume ?? 1)).toFixed(3)),
        stems: Object.entries(saved?.mixer?.stems || {}).map(([id, stem]) => ({
          id: String(id),
          name: String(stem?.name || ''),
          volume: Number((Number(stem?.volume ?? 1)).toFixed(3)),
          muted: Boolean(stem?.muted),
          solo: Boolean(stem?.solo),
        })).sort((a, b) => a.id.localeCompare(b.id)),
      },
    });
  }, [currentSong?.livePlayback, currentSong?.bpm]);

  const liveMapDirty = currentLiveMapSignature !== savedLiveMapSignature;

  const togglePlay = async () => {
    if (loadingAudio || audioError || playback.stems.length === 0) return;
    if (engineRef.current.getState().playing) engineRef.current.pause();
    else await engineRef.current.play();
    setPlayback(engineRef.current.getState());
  };

  const stopPlayback = () => {
    setPendingSectionAction(null);
    engineRef.current.stop();
    setPlayback(engineRef.current.getState());
    setNavigationNotice('');
  };

  const seekPlayback = async (event) => {
    setPendingSectionAction(null);
    setNavigationNotice('');
    await engineRef.current.seek(Number(event.target.value));
    setPlayback(engineRef.current.getState());
  };

  const seekPreparationTimeline = async (event) => {
    if (loadingAudio || timelineDuration <= 0 || preparationTimelineDragRef.current) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width) return;
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    setPendingSectionAction(null);
    setNavigationNotice('');
    await engineRef.current.seek(ratio * timelineDuration);
    setPlayback(engineRef.current.getState());
  };

  const getSnappedTimelineSectionPosition = (sectionId, clientX) => {
    const rect = preparationTimelineRef.current?.getBoundingClientRect();
    const secondsPerBar = currentBpm > 0 ? (60 / currentBpm) * currentBeatsPerBar : 0;
    if (!rect?.width || !secondsPerBar || timelineDuration <= 0) return null;

    const sectionIndex = currentSections.findIndex((section) => section.id === sectionId);
    if (sectionIndex < 0) return null;

    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const rawTime = ratio * timelineDuration;
    const rawBar = Math.round((rawTime - currentGridOffset) / secondsPerBar) + 1;
    const lastBar = Math.max(1, Math.floor((timelineDuration - currentGridOffset - 0.01) / secondsPerBar) + 1);
    const previousSection = currentSections[sectionIndex - 1];
    const nextSection = currentSections[sectionIndex + 1];
    const minBar = previousSection ? Math.max(1, Number(previousSection.bar) + 1) : 1;
    const maxBar = nextSection ? Math.min(lastBar, Math.max(1, Number(nextSection.bar) - 1)) : lastBar;
    const safeMin = Math.min(minBar, maxBar);
    const safeMax = Math.max(minBar, maxBar);
    const bar = Math.min(safeMax, Math.max(safeMin, rawBar));
    const start = currentGridOffset + ((bar - 1) * secondsPerBar);

    return {
      sectionId,
      bar,
      start: Math.min(Math.max(0, start), Math.max(0, timelineDuration - 0.01)),
    };
  };

  const cloneTimelineSections = (sections) => sections.map((item) => ({ ...item }));

  const restoreTimelineSections = (sections, notice) => {
    if (!currentSongGridKey) return;
    if (playback.loop) {
      setPlayback(engineRef.current.cancelLoop());
    }
    setTimelineDragPreview(null);
    preparationTimelineDragRef.current = null;
    setSectionError('');
    setSectionsBySong((previous) => ({
      ...previous,
      [currentSongGridKey]: cloneTimelineSections(sections).sort((a, b) => a.start - b.start),
    }));
    setLiveMapNotice(notice);
  };

  const undoTimelineSectionChange = () => {
    if (timelineHistoryPast.length === 0) return;
    const previousSnapshot = timelineHistoryPast[timelineHistoryPast.length - 1];
    const currentSnapshot = cloneTimelineSections(currentSections);
    setTimelineHistoryPast((previous) => previous.slice(0, -1));
    setTimelineHistoryFuture((previous) => [currentSnapshot, ...previous].slice(0, 30));
    restoreTimelineSections(previousSnapshot, 'Último movimiento de sección deshecho. Guarda el Live Map si quieres conservar este estado.');
  };

  const redoTimelineSectionChange = () => {
    if (timelineHistoryFuture.length === 0) return;
    const nextSnapshot = timelineHistoryFuture[0];
    const currentSnapshot = cloneTimelineSections(currentSections);
    setTimelineHistoryFuture((previous) => previous.slice(1));
    setTimelineHistoryPast((previous) => [...previous.slice(-29), currentSnapshot]);
    restoreTimelineSections(nextSnapshot, 'Movimiento de sección rehecho. Guarda el Live Map si quieres conservar este estado.');
  };

  const commitTimelineSectionPosition = (sectionId, position) => {
    if (!position || !currentSongGridKey) return;
    const section = currentSections.find((item) => item.id === sectionId);
    if (!section) return;

    const collides = currentSections.some((item) => item.id !== sectionId && Number(item.bar) === Number(position.bar));
    if (collides) {
      setSectionError('Ese compás ya pertenece al inicio de otra sección.');
      return;
    }

    if (Number(section.bar) === Number(position.bar)) return;

    const historySnapshot = cloneTimelineSections(currentSections);
    setTimelineHistoryPast((previous) => [...previous.slice(-29), historySnapshot]);
    setTimelineHistoryFuture([]);

    if (playback.loop) {
      setPlayback(engineRef.current.cancelLoop());
    }

    setSectionError('');
    setSectionsBySong((previous) => ({
      ...previous,
      [currentSongGridKey]: (previous[currentSongGridKey] || []).map((item) =>
        item.id === sectionId ? { ...item, bar: position.bar, start: position.start } : item
      ).sort((a, b) => a.start - b.start),
    }));
    setLiveMapNotice(section.label + ' movida al compás ' + position.bar + '. Guarda el Live Map para conservar el cambio.');
  };

  const handleTimelineSectionPointerDown = (event, section) => {
    if (!currentBpm || timelineDuration <= 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    preparationTimelineDragRef.current = {
      sectionId: section.id,
      pointerId: event.pointerId,
      originalBar: Number(section.bar),
      moved: false,
    };
    setTimelineDragPreview({ sectionId: section.id, bar: Number(section.bar), start: Number(section.start) || 0 });
  };

  const handleTimelineSectionPointerMove = (event, section) => {
    const drag = preparationTimelineDragRef.current;
    if (!drag || drag.sectionId !== section.id || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const position = getSnappedTimelineSectionPosition(section.id, event.clientX);
    if (!position) return;
    if (position.bar !== drag.originalBar) drag.moved = true;
    setTimelineDragPreview(position);
  };

  const handleTimelineSectionPointerEnd = (event, section, cancelled = false) => {
    const drag = preparationTimelineDragRef.current;
    if (!drag || drag.sectionId !== section.id || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();

    const position = cancelled ? null : getSnappedTimelineSectionPosition(section.id, event.clientX);
    const moved = Boolean(drag.moved && position && position.bar !== drag.originalBar);
    preparationTimelineDragRef.current = null;
    setTimelineDragPreview(null);

    if (cancelled) return;
    if (moved) {
      commitTimelineSectionPosition(section.id, position);
      return;
    }
    void goToSection(section);
  };

  const changeSong = (nextIndex) => {
    if (nextIndex < 0 || nextIndex >= playlist.length || nextIndex === currentIndex) return;
    if (liveRunnerMode && playback.playing) {
      setNavigationNotice('La canción sigue reproduciéndose. Pulsa Stop o Pausa antes de cambiar de tema.');
      return;
    }
    setPendingSectionAction(null);
    setNavigationNotice('');
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
  const restoreSavedMixer = () => {
    if (!currentSong?.livePlayback?.mixer || playback.stems.length === 0) return;
    engineRef.current.applyMixerPreset(currentSong.livePlayback.mixer);
    setPlayback(engineRef.current.getState());
    setLiveMapNotice('Mezcla guardada restaurada.');
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

  const goToSectionNow = async (section, message = '') => {
    setSectionError('');
    setPendingSectionAction(null);
    try {
      await engineRef.current.seek(section.start);
      setPlayback(engineRef.current.getState());
      if (message) setNavigationNotice(message);
    } catch (error) {
      setSectionError(error?.message || 'No se pudo ir a esa sección.');
    }
  };

  const goToSection = async (section) => {
    setSectionError('');
    if (!section) return;

    const now = Date.now();
    const previousTap = sectionTapRef.current;
    const doubleTap = liveRunnerMode
      && playback.playing
      && previousTap.id === section.id
      && now - previousTap.at <= 430;
    sectionTapRef.current = { id: section.id, at: now };

    if (!liveRunnerMode || !playback.playing || doubleTap) {
      await goToSectionNow(
        section,
        doubleTap ? ('Salto inmediato → ' + section.label) : ''
      );
      return;
    }

    if (pendingSectionAction?.type === 'jump' && pendingSectionAction.sectionId === section.id) {
      setPendingSectionAction(null);
      setNavigationNotice('Salto programado cancelado.');
      return;
    }

    const activeIndex = getSectionIndexAtTime(playback.currentTime);
    if (activeIndex < 0) {
      await goToSectionNow(section, 'Salto inmediato → ' + section.label);
      return;
    }

    let executeAt = getSectionEnd(activeIndex);
    if (playback.loop) {
      executeAt = playback.loop.end;
      setPlayback(engineRef.current.requestLoopExit());
    }

    if (!executeAt || executeAt <= playback.currentTime + 0.02) {
      await goToSectionNow(section, 'Salto inmediato → ' + section.label);
      return;
    }

    setPendingSectionAction({
      type: 'jump',
      sectionId: section.id,
      label: section.label,
      start: section.start,
      executeAt,
    });
    setNavigationNotice('Programado → ' + section.label + '. Esperará al final de ' + (currentSections[activeIndex]?.label || 'la sección actual') + '. Doble toque para ir ahora.');
  };

  const loopSectionNow = async (sectionIndex, message = '') => {
    const section = currentSections[sectionIndex];
    const nextSection = currentSections[sectionIndex + 1];
    if (!section || !nextSection) return;

    try {
      await engineRef.current.seek(section.start);
      const bars = Math.max(1, Math.round((nextSection.start - section.start) / musicalPosition.secondsPerBar));
      const nextState = engineRef.current.setLoopRegion(section.start, nextSection.start, { bars });
      setPendingSectionAction(null);
      setPlayback(nextState);
      if (message) setNavigationNotice(message);
    } catch (error) {
      setSectionError(error?.message || 'No se pudo repetir esa sección.');
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

    const now = Date.now();
    const previousTap = loopTapRef.current;
    const doubleTap = liveRunnerMode
      && playback.playing
      && previousTap.id === section.id
      && now - previousTap.at <= 430;
    loopTapRef.current = { id: section.id, at: now };

    if (!liveRunnerMode || !playback.playing || doubleTap) {
      await loopSectionNow(
        sectionIndex,
        doubleTap ? ('Loop inmediato → ' + section.label) : ''
      );
      return;
    }

    const sameActiveLoop = playback.loop
      && Math.abs(playback.loop.start - section.start) < 0.03
      && Math.abs(playback.loop.end - nextSection.start) < 0.03;
    if (sameActiveLoop) {
      setPlayback(engineRef.current.requestLoopExit());
      setNavigationNotice('Salida del loop programada al final de ' + section.label + '.');
      return;
    }

    if (pendingSectionAction?.type === 'loop' && pendingSectionAction.sectionId === section.id) {
      setPendingSectionAction(null);
      setNavigationNotice('Loop programado cancelado.');
      return;
    }

    const activeIndex = getSectionIndexAtTime(playback.currentTime);
    const bars = Math.max(1, Math.round((nextSection.start - section.start) / musicalPosition.secondsPerBar));

    if (activeIndex === sectionIndex) {
      try {
        const nextState = engineRef.current.setLoopRegion(section.start, nextSection.start, { bars });
        setPendingSectionAction(null);
        setPlayback(nextState);
        setNavigationNotice('Loop armado en ' + section.label + ': continuará hasta el final y luego repetirá desde el inicio.');
      } catch (error) {
        setSectionError(error?.message || 'No se pudo repetir esa sección.');
      }
      return;
    }

    if (activeIndex < 0) {
      await loopSectionNow(sectionIndex, 'Loop inmediato → ' + section.label);
      return;
    }

    let executeAt = getSectionEnd(activeIndex);
    if (playback.loop) {
      executeAt = playback.loop.end;
      setPlayback(engineRef.current.requestLoopExit());
    }

    setPendingSectionAction({
      type: 'loop',
      sectionId: section.id,
      sectionIndex,
      label: section.label,
      start: section.start,
      end: nextSection.start,
      bars,
      executeAt,
    });
    setNavigationNotice('Loop programado → ' + section.label + '. Esperará al final de ' + (currentSections[activeIndex]?.label || 'la sección actual') + '. Doble toque para ir ahora.');
  };

  useEffect(() => {
    const action = pendingSectionAction;
    if (!action || !playback.playing || pendingActionRunningRef.current) return;
    if (playback.currentTime < action.executeAt - 0.02) return;

    pendingActionRunningRef.current = true;
    setPendingSectionAction(null);

    const execute = async () => {
      try {
        await engineRef.current.seek(action.start);
        if (action.type === 'loop') {
          const nextState = engineRef.current.setLoopRegion(action.start, action.end, { bars: action.bars });
          setPlayback(nextState);
          setNavigationNotice('Loop activo → ' + action.label);
        } else {
          setPlayback(engineRef.current.getState());
          setNavigationNotice('Ahora → ' + action.label);
        }
      } catch (error) {
        setSectionError(error?.message || 'No se pudo ejecutar la navegación programada.');
      } finally {
        pendingActionRunningRef.current = false;
      }
    };

    execute();
  }, [playback.currentTime, playback.playing, pendingSectionAction]);
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

  const saveLiveMap = async () => {
    setLiveMapNotice('');
    setSectionError('');

    if (!currentSong?.id) {
      setLiveMapNotice('No hay una canción válida para guardar.');
      return;
    }
    if (!currentBpm) {
      setLiveMapNotice('La canción necesita un BPM válido antes de guardar el Live Map.');
      return;
    }
    if (editingSectionId) {
      setLiveMapNotice('Guarda o cancela la edición de la sección antes de guardar el Live Map.');
      return;
    }

    const sections = currentSections.map((section) => ({
      id: String(section.id),
      label: String(section.label || '').trim(),
      baseLabel: String(section.baseLabel || section.label || '').trim(),
      bar: Math.max(1, Math.round(Number(section.bar) || 1)),
    })).sort((a, b) => a.bar - b.bar);

    if (getSongAudioCount(currentSong) > 0 && playback.stems.length === 0) {
      setLiveMapNotice('Espera a que termine de cargar el audio antes de guardar la mezcla.');
      return;
    }

    const mixer = {
      masterVolume: Number((playback.masterVolume ?? 1).toFixed(3)),
      stems: Object.fromEntries(playback.stems.map((stem) => [String(stem.id), {
        name: String(stem.name || ''),
        volume: Number((stem.volume ?? 1).toFixed(3)),
        muted: Boolean(stem.muted),
        solo: Boolean(stem.solo),
      }])),
    };

    const livePlayback = {
      version: 2,
      bpm: currentBpm,
      timeSignature: { beats: currentBeatsPerBar, unit: 4 },
      gridOffsetSeconds: Number(currentGridOffset.toFixed(3)),
      sections,
      mixer,
      updatedAt: new Date().toISOString(),
    };

    const editorId = user?.uid || user?.id || user?.email || '';
    if (editorId) livePlayback.updatedBy = String(editorId);

    setSavingLiveMap(true);
    try {
      await updateDoc(doc(db, 'canciones', currentSong.id), { livePlayback });
      setSongsById((previous) => ({
        ...previous,
        [currentSong.id]: { ...previous[currentSong.id], livePlayback },
      }));
      setLiveMapNotice('Live Map guardado. Puedes recargar y debe mantenerse.');
    } catch (error) {
      console.error('Error guardando Live Map:', error);
      setLiveMapNotice(error?.message || 'No se pudo guardar el Live Map.');
    } finally {
      setSavingLiveMap(false);
    }
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
          <button type="button" onClick={() => navigate(standaloneSongMode ? '/multitrack-live' : `/setlist/${eventoId}`)} className="mt-6 rounded-2xl bg-white px-5 py-3 text-sm font-black text-zinc-950">
            {standaloneSongMode ? 'Volver a Multitrack Live' : 'Volver al setlist'}
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
    <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-[#050608] text-zinc-100">
      <header className="sticky top-0 z-30 w-full max-w-full overflow-x-hidden border-b border-white/10 bg-[#050608]/95 px-3 py-2.5 backdrop-blur md:px-5 md:py-3">
        <div className="mx-auto flex w-full min-w-0 max-w-[1800px] flex-wrap items-center justify-between gap-2 sm:gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <button type="button" onClick={() => navigate(standaloneSongMode ? '/multitrack-live' : `/setlist/${eventoId}`)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10 hover:text-white" title={standaloneSongMode ? 'Volver a Multitrack Live' : 'Volver al setlist'}>
              <ArrowLeft size={18} />
            </button>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-300">
              <Radio size={20} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="truncate text-base font-black md:text-lg">Multitrack Live</p>
                <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-emerald-200">{liveRunnerMode ? 'Live Runner' : 'Editor'}</span>
              </div>
              <p className="truncate text-[11px] font-semibold text-zinc-500">{standaloneSongMode ? 'Editor de canción' : (evento?.titulo || 'Setlist')} · Operador: {user?.nombre || 'Usuario'}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
{standaloneSongMode && (
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
                  ? (standaloneSongMode ? 'Canción preparada' : 'Setlist preparado')
                  : (standaloneSongMode ? 'Preparar canción' : 'Preparar setlist')}
            </button>
            )}
            <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2">
              <div className={`h-2.5 w-2.5 rounded-full ${playback.playing ? 'bg-emerald-400 shadow-[0_0_14px_rgba(52,211,153,.9)]' : 'bg-zinc-600'}`} />
              <span className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-400">{playback.playing ? 'Reproduciendo' : loadingAudio ? 'Cargando' : 'Listo'}</span>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full min-w-0 max-w-[1800px] px-3 pt-3 md:px-5 md:pt-4">
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
                          ? (standaloneSongMode ? 'Canción lista para Live' : 'Setlist listo para Live')
                          : (standaloneSongMode ? 'Canción pendiente de preparación' : 'Setlist pendiente de preparación')}
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
        <div className="mx-auto w-full min-w-0 max-w-[1800px] px-3 pt-3 md:px-5 md:pt-4">
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

      <main className="mx-auto grid w-full min-w-0 max-w-[1800px] overflow-x-hidden gap-3 p-3 md:gap-4 md:p-5 xl:grid-cols-[280px_minmax(0,1fr)_360px]">
        <aside className="order-2 w-full min-w-0 max-w-full overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035] p-3 xl:order-1 xl:sticky xl:top-[82px] xl:h-[calc(100vh-102px)]">
          <div className="mb-3 flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <ListMusic size={16} className="text-violet-300" />
              <h2 className="text-xs font-black uppercase tracking-[0.16em] text-zinc-300">{standaloneSongMode ? 'Canción' : 'Setlist'}</h2>
            </div>
            <span className="text-[10px] font-bold text-zinc-600">{playlist.length} canciones</span>
          </div>

          <div className="grid w-full min-w-0 grid-cols-1 gap-2 pb-1 sm:grid-cols-2 lg:grid-cols-3 xl:h-[calc(100%-32px)] xl:grid-cols-1 xl:overflow-y-auto xl:overflow-x-hidden xl:pr-1">
            {playlist.map((song, index) => {
              const count = getSongAudioCount(song);
              const active = index === currentIndex;
              const next = liveRunnerMode && index === currentIndex + 1;
              const songReadiness = readinessByKey.get(String(song.setlistItemId));
              const ready = songReadiness?.status === 'ready';
              const partial = songReadiness?.status === 'partial';
              return (
                <button
                  key={song.setlistItemId}
                  type="button"
                  onClick={() => changeSong(index)}
                  className={`w-full min-w-0 max-w-full rounded-2xl border p-3 text-left transition-all ${active ? 'border-emerald-400/40 bg-emerald-400/10 shadow-[0_0_25px_rgba(16,185,129,.08)]' : next ? 'border-cyan-400/25 bg-cyan-400/[0.055] hover:border-cyan-300/40' : 'border-white/8 bg-black/20 hover:border-white/20 hover:bg-white/[0.04]'}`}
                >
                  <div className="flex items-start gap-3">
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[10px] font-black ${active ? 'bg-emerald-400 text-zinc-950' : 'bg-white/8 text-zinc-500'}`}>{index + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className={`min-w-0 flex-1 truncate text-sm font-black ${active ? 'text-white' : 'text-zinc-300'}`}>{song.titulo}</p>
                        {liveRunnerMode && active && <span className="shrink-0 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2 py-0.5 text-[8px] font-black uppercase tracking-widest text-emerald-300">Actual</span>}
                        {next && <span className="shrink-0 rounded-full border border-cyan-400/25 bg-cyan-400/10 px-2 py-0.5 text-[8px] font-black uppercase tracking-widest text-cyan-200">Siguiente</span>}
                      </div>
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

        <section className="order-1 w-full min-w-0 max-w-full space-y-3 overflow-x-hidden xl:order-2">
          <div className="min-w-0 overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-zinc-900 to-black p-4 shadow-2xl shadow-black/30 md:p-6">
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

                {liveRunnerMode && (
                  <div className="mt-5 grid gap-2 sm:grid-cols-2">
                    <div className="rounded-2xl border border-emerald-400/25 bg-emerald-400/[0.07] p-3">
                      <p className="text-[9px] font-black uppercase tracking-[0.18em] text-emerald-300">Ahora en Live</p>
                      <p className="mt-1 truncate text-sm font-black text-white">{currentSong.titulo}</p>
                    </div>
                    <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/[0.045] p-3">
                      <p className="text-[9px] font-black uppercase tracking-[0.18em] text-cyan-300">Siguiente</p>
                      <p className="mt-1 truncate text-sm font-black text-zinc-200">{playlist[currentIndex + 1]?.titulo || 'Fin del setlist'}</p>
                    </div>
                  </div>
                )}

                {liveRunnerMode && (
                  <div className="mt-4 min-w-0 max-w-full xl:hidden">
                    <div className="min-w-0 max-w-full overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035] p-3 shadow-xl shadow-black/20">
                      <div className="mb-3 flex min-w-0 flex-wrap items-center justify-between gap-2 px-1">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-300">Control táctil Live</p>
                          <p className="mt-1 text-[9px] font-semibold text-zinc-600">Vista optimizada para tablet y móvil.</p>
                        </div>
                        <span className="rounded-full border border-white/10 bg-black/25 px-2 py-1 text-[8px] font-black uppercase tracking-widest text-zinc-500">Touch</span>
                      </div>

                                            <div className="mb-3 rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.055] p-2.5 sm:p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-[9px] font-black uppercase tracking-[0.16em] text-emerald-300">Operación táctil</p>
                            <p className="mt-0.5 hidden text-[9px] font-semibold text-zinc-600 sm:block">Transporte principal siempre a mano durante Live.</p>
                          </div>
                          <span className="shrink-0 font-mono text-[10px] font-black tabular-nums text-zinc-300 sm:text-xs">{formatTime(playback.currentTime)} / {formatTime(playback.duration)}</span>
                        </div>

                        <input
                          type="range"
                          min="0"
                          max={playback.duration || 1}
                          step="0.01"
                          value={Math.min(playback.currentTime, playback.duration || 0)}
                          onChange={seekPlayback}
                          disabled={loadingAudio || playback.duration <= 0}
                          aria-label="Posición de reproducción Live"
                          className="mt-2.5 h-2 w-full cursor-pointer appearance-none rounded-full bg-zinc-800 accent-emerald-400 disabled:cursor-not-allowed disabled:opacity-40 sm:h-2.5"
                        />

                        <div className="mt-2.5 grid min-w-0 grid-cols-[42px_42px_minmax(0,1fr)_42px] items-center gap-1.5 sm:grid-cols-[56px_56px_minmax(120px,1fr)_56px] sm:gap-2.5">
                          <button type="button" onClick={() => changeSong(currentIndex - 1)} disabled={currentIndex === 0} className="flex h-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-zinc-300 active:scale-[0.98] disabled:opacity-25 sm:h-13 sm:rounded-2xl" title="Canción anterior"><SkipBack size={18} /></button>
                          <button type="button" onClick={stopPlayback} disabled={loadingAudio || playback.stems.length === 0} className="flex h-10 items-center justify-center rounded-xl border border-red-400/20 bg-red-400/10 text-red-200 active:scale-[0.98] disabled:opacity-25 sm:h-13 sm:rounded-2xl" title="Stop"><Square size={16} fill="currentColor" /></button>
                          <button type="button" onClick={togglePlay} disabled={loadingAudio || Boolean(audioError) || playback.stems.length === 0} className="flex h-11 min-w-0 items-center justify-center gap-1.5 overflow-hidden rounded-xl bg-emerald-400 px-2 text-[10px] font-black uppercase tracking-[0.06em] text-zinc-950 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-500 sm:h-14 sm:gap-2 sm:rounded-2xl sm:px-4 sm:text-xs sm:tracking-[0.1em]">
                            {loadingAudio ? <Loader2 size={19} className="animate-spin" /> : playback.playing ? <Pause size={19} fill="currentColor" /> : <Play size={19} fill="currentColor" />}
                            <span className="hidden min-w-0 truncate sm:inline">{loadingAudio ? 'Cargando' : playback.playing ? 'Pausa' : 'Play'}</span>
                          </button>
                          <button type="button" onClick={() => changeSong(currentIndex + 1)} disabled={currentIndex >= playlist.length - 1} className="flex h-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-zinc-300 active:scale-[0.98] disabled:opacity-25 sm:h-13 sm:rounded-2xl" title="Canción siguiente"><SkipForward size={18} /></button>
                        </div>
                      </div>

                      <div className="grid w-full min-w-0 gap-1.5 rounded-2xl border border-white/8 bg-black/25 p-1.5 sm:gap-2" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)' }}>
                        <button
                          type="button"
                          onClick={() => setLiveTouchPanel('sections')}
                          aria-pressed={liveTouchPanel === 'sections'}
                          className={'flex min-h-12 w-full min-w-0 items-center justify-center gap-1.5 overflow-hidden whitespace-nowrap rounded-xl px-2 text-[9px] font-black uppercase tracking-[0.08em] transition-colors sm:gap-2 sm:px-3 sm:text-[10px] sm:tracking-[0.12em] ' + (liveTouchPanel === 'sections' ? 'bg-cyan-400 text-zinc-950' : 'text-zinc-400 hover:bg-white/[0.05]')}
                        >
                          <ListMusic size={16} /> Secciones
                        </button>
                        <button
                          type="button"
                          onClick={() => setLiveTouchPanel('mixer')}
                          aria-pressed={liveTouchPanel === 'mixer'}
                          className={'flex min-h-12 w-full min-w-0 items-center justify-center gap-1.5 overflow-hidden whitespace-nowrap rounded-xl px-2 text-[9px] font-black uppercase tracking-[0.08em] transition-colors sm:gap-2 sm:px-3 sm:text-[10px] sm:tracking-[0.12em] ' + (liveTouchPanel === 'mixer' ? 'bg-blue-400 text-zinc-950' : 'text-zinc-400 hover:bg-white/[0.05]')}
                        >
                          <SlidersHorizontal size={16} /> Mixer
                        </button>
                      </div>

                      {liveTouchPanel === 'sections' ? (
                        <div className="mt-3 min-w-0 overflow-hidden rounded-2xl border border-cyan-400/15 bg-cyan-400/[0.035] p-3">
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-cyan-300">Secciones rápidas</p>
                              <p className="mt-1 text-[9px] font-semibold text-zinc-600">Toca una sección para saltar. Loop permanece separado para evitar errores.</p>
                            </div>
                            <span className="font-mono text-[9px] font-bold text-zinc-600">{currentSections.length} secciones</span>
                          </div>
                          <div className={'mt-3 flex min-w-0 items-center justify-between gap-2 rounded-xl border px-3 py-2 text-[9px] font-black ' + (playback.loop ? (playback.loop.phase === 'exiting' ? 'border-amber-400/30 bg-amber-400/10 text-amber-100' : 'border-fuchsia-400/30 bg-fuchsia-400/10 text-fuchsia-100') : 'border-white/10 bg-black/20 text-zinc-500')}>
                            <span className="min-w-0 truncate">Estado del loop · {playback.loop ? (playback.loop.phase === 'exiting' ? 'SALIENDO' : 'ACTIVO') : 'DESACTIVADO'}{activeLoopSection ? ' · ' + activeLoopSection.label : ''}</span>
                            <span className="shrink-0 font-mono text-[8px] text-zinc-600">{playback.loop ? (playback.loop.phase === 'exiting' ? 'fin de vuelta' : formatTime(playback.loop.start) + ' → ' + formatTime(playback.loop.end)) : 'OFF'}</span>
                          </div>
                          {pendingSectionAction && (
                            <div className={'mt-3 flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-[9px] font-black ' + (pendingSectionAction.type === 'loop' ? 'border-fuchsia-400/25 bg-fuchsia-400/10 text-fuchsia-100' : 'border-cyan-400/25 bg-cyan-400/10 text-cyan-100')}>
                              <span className="min-w-0 truncate">Acción programada · {pendingSectionAction.type === 'loop' ? 'LOOP' : 'IR'} → {pendingSectionAction.label}</span>
                              <span className="shrink-0 font-mono text-zinc-500">al final</span>
                            </div>
                          )}
                          {currentSections.length > 0 ? (
                            <div className="mt-3 grid gap-2 sm:grid-cols-2">
                              {currentSections.map((section, sectionIndex) => (
                                <div key={section.id} className="grid min-w-0 grid-cols-[minmax(0,1fr)_60px] gap-2 rounded-2xl border border-white/8 bg-black/20 p-2 sm:grid-cols-[minmax(0,1fr)_72px]">
                                  <button type="button" onClick={() => goToSection(section)} className={'min-h-16 rounded-xl border px-3 text-left active:scale-[0.99] ' + (pendingSectionAction?.type === 'jump' && pendingSectionAction.sectionId === section.id ? 'border-cyan-300/50 bg-cyan-300/20' : currentLiveSection?.id === section.id ? 'border-emerald-400/45 bg-emerald-400/15' : 'border-cyan-400/20 bg-cyan-400/10')}>
                                    <p className="truncate text-sm font-black text-cyan-100">{section.label}</p>
                                    <p className="mt-1 font-mono text-[9px] font-bold text-cyan-300/55">Compás {section.bar} · {formatTime(section.start)}</p>
                                  </button>
                                  <button type="button" onClick={() => loopSection(sectionIndex)} disabled={sectionIndex >= currentSections.length - 1} className={'min-h-16 rounded-xl border text-[9px] font-black uppercase tracking-wide active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-25 ' + (pendingSectionAction?.type === 'loop' && pendingSectionAction.sectionId === section.id ? 'border-fuchsia-300/55 bg-fuchsia-300/25 text-fuchsia-50' : 'border-fuchsia-400/20 bg-fuchsia-400/10 text-fuchsia-200')}>Loop</button>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="mt-3 rounded-xl border border-amber-400/15 bg-amber-400/[0.05] p-3 text-[10px] font-bold text-amber-200">Esta canción no tiene secciones guardadas. Configúrala desde Administración antes del servicio.</div>
                          )}
                          {sectionError && <div className="mt-3 flex gap-2 rounded-xl border border-red-400/20 bg-red-400/[0.07] p-3 text-red-200"><AlertTriangle size={15} className="mt-0.5 shrink-0" /><p className="text-[10px] font-bold leading-relaxed">{sectionError}</p></div>}
                        </div>
                      ) : (
                        <div className="mt-3 min-w-0 max-w-full overflow-hidden rounded-2xl border border-blue-400/15 bg-blue-400/[0.035] p-3">
                          <div className="mb-3 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-300">Mixer Live</p>
                              <p className="mt-1 text-[9px] font-semibold text-zinc-600">Faders verticales optimizados para touch. Desliza horizontalmente para ver todos los canales.</p>
                            </div>
                            <span className="text-[9px] font-bold text-zinc-600">{playback.stems.length} stems</span>
                          </div>

                          {currentSong?.livePlayback?.mixer && (
                            <div className="mb-3 flex flex-col gap-2 rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.05] p-3 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <p className="text-[9px] font-black uppercase tracking-widest text-emerald-300">Mezcla guardada</p>
                                <p className="mt-1 text-[9px] font-semibold text-zinc-600">Preset del Live Map cargado para esta canción.</p>
                              </div>
                              <button type="button" onClick={restoreSavedMixer} disabled={playback.stems.length === 0} className="min-h-11 rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-3 text-[9px] font-black uppercase tracking-wide text-emerald-200 disabled:opacity-30">Restaurar mezcla</button>
                            </div>
                          )}

                          {playback.stems.some((stem) => stem.solo) && (
                            <div className="mb-3 flex gap-2 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] p-3 text-amber-200">
                              <AlertTriangle size={14} className="shrink-0" />
                              <p className="text-[9px] font-bold leading-relaxed">Hay uno o más canales en Solo.</p>
                            </div>
                          )}

                          {playback.stems.length > 0 ? (
                            <div className="w-full max-w-full overflow-x-auto overflow-y-hidden pb-2 overscroll-x-contain" style={{ touchAction: 'pan-x pan-y' }}>
                              <div className="flex w-max min-w-full gap-2">
                                <div className="flex w-24 shrink-0 flex-col items-center rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.055] p-2 sm:w-28 sm:p-2.5">
                                  <div className="flex min-h-10 w-full items-center justify-center gap-1.5 border-b border-white/8 pb-2">
                                    <Volume2 size={14} className="text-emerald-300" />
                                    <p className="truncate text-[9px] font-black uppercase tracking-widest text-emerald-200">Master</p>
                                  </div>
                                  <p className="mt-2 font-mono text-[10px] font-black text-emerald-300">{Math.round(playback.masterVolume * 100)}%</p>
                                  <div className="my-2 flex h-48 items-center justify-center rounded-xl border border-white/8 bg-black/25 px-3">
                                    <input
                                      type="range"
                                      min="0"
                                      max="1"
                                      step="0.01"
                                      value={playback.masterVolume}
                                      onChange={(event) => changeMasterVolume(Number(event.target.value))}
                                      aria-label="Volumen master"
                                      style={{ writingMode: 'vertical-lr', direction: 'rtl', touchAction: 'none' }}
                                      className="h-40 w-10 cursor-pointer accent-emerald-400"
                                    />
                                  </div>
                                  <div className="flex h-11 w-full items-center justify-center rounded-xl border border-emerald-400/15 bg-emerald-400/[0.06] text-[8px] font-black uppercase tracking-widest text-emerald-300">Salida</div>
                                </div>

                                {playback.stems.map((stem) => (
                                  <div key={stem.id} className={'flex w-24 shrink-0 flex-col items-center rounded-2xl border p-2 sm:w-28 sm:p-2.5 ' + (stem.solo ? 'border-amber-400/35 bg-amber-400/[0.055]' : stem.muted ? 'border-red-400/25 bg-red-400/[0.045]' : 'border-white/8 bg-black/25')}>
                                    <div className="flex min-h-10 w-full items-center border-b border-white/8 pb-2">
                                      <p className="w-full truncate text-center text-[10px] font-black text-zinc-200" title={stem.name}>{stem.name}</p>
                                    </div>
                                    <p className="mt-2 font-mono text-[10px] font-black text-blue-300">{Math.round(stem.volume * 100)}%</p>
                                    <div className="my-2 flex h-48 items-center justify-center rounded-xl border border-white/8 bg-black/25 px-3">
                                      <input
                                        type="range"
                                        min="0"
                                        max="1"
                                        step="0.01"
                                        value={stem.volume}
                                        onChange={(event) => changeStemVolume(stem.id, Number(event.target.value))}
                                        aria-label={'Volumen ' + stem.name}
                                        style={{ writingMode: 'vertical-lr', direction: 'rtl', touchAction: 'none' }}
                                        className="h-40 w-10 cursor-pointer accent-blue-400"
                                      />
                                    </div>
                                    <div className="grid w-full grid-cols-2 gap-1.5">
                                      <button
                                        type="button"
                                        onClick={() => toggleMute(stem.id)}
                                        aria-pressed={stem.muted}
                                        className={'flex h-11 items-center justify-center rounded-xl text-[9px] font-black ' + (stem.muted ? 'bg-red-500 text-white' : 'border border-white/10 bg-white/5 text-zinc-400')}
                                        title="Mute"
                                      >
                                        {stem.muted ? <VolumeX size={15} /> : 'M'}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => toggleSolo(stem.id)}
                                        aria-pressed={stem.solo}
                                        className={'flex h-11 items-center justify-center rounded-xl text-[9px] font-black ' + (stem.solo ? 'bg-amber-400 text-zinc-950' : 'border border-white/10 bg-white/5 text-zinc-400')}
                                        title="Solo"
                                      >S</button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : !loadingAudio ? (
                            <div className="rounded-2xl border border-dashed border-white/10 p-6 text-center">
                              <Music2 className="mx-auto text-zinc-700" size={28} />
                              <p className="mt-3 text-xs font-bold text-zinc-600">Selecciona una canción con audio para cargar el mixer.</p>
                            </div>
                          ) : null}
                        </div>
                      )}
                    </div>
                  </div>
                )}

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
                    {standaloneSongMode ? (
                      <>
                        <p className="mt-2 text-[10px] font-semibold leading-relaxed text-zinc-600">Marca el instante exacto donde comienza el compás 1. Esta referencia se guarda dentro del Live Map.</p>
                        <p className="mt-3 font-mono text-xs font-black text-zinc-300">Inicio: {formatTime(currentGridOffset)}</p>
                        <div className="mt-3 grid gap-2">
                          <button type="button" onClick={markGridStart} disabled={!currentBpm || playback.stems.length === 0} className="rounded-xl bg-cyan-400 px-3 py-2.5 text-[10px] font-black uppercase tracking-wide text-zinc-950 hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-600">Marcar compás 1 aquí</button>
                          <button type="button" onClick={resetGridStart} disabled={!currentSongGridKey || currentGridOffset === 0} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-[10px] font-black uppercase tracking-wide text-zinc-400 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30">Reiniciar a 0:00</button>
                        </div>
                      </>
                    ) : (
                      <>
                        <p className="mt-2 text-[10px] font-semibold leading-relaxed text-zinc-600">Alineación cargada desde el Live Map. En modo Live no se modifica accidentalmente.</p>
                        <p className="mt-3 font-mono text-xs font-black text-emerald-200">Compás 1: {formatTime(currentGridOffset)}</p>
                      </>
                    )}
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

                {liveRunnerMode && (
                  <div className="mt-3 hidden xl:block rounded-2xl border border-cyan-400/20 bg-cyan-400/[0.045] p-4">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-300">Secciones rápidas</p>
                      <p className="mt-1 text-[10px] font-semibold text-zinc-500">Salta o repite partes usando el Live Map guardado. Aquí no se edita la estructura.</p>
                    </div>
                    {currentSections.length > 0 ? (
                      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {currentSections.map((section, sectionIndex) => (
                          <div key={section.id} className="grid grid-cols-[1fr_66px] gap-2 rounded-2xl border border-white/8 bg-black/20 p-2">
                            <button type="button" onClick={() => goToSection(section)} className="min-h-14 rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-3 text-left hover:bg-cyan-400/20">
                              <p className="truncate text-sm font-black text-cyan-100">{section.label}</p>
                              <p className="mt-1 font-mono text-[9px] font-bold text-cyan-300/55">Compás {section.bar} · {formatTime(section.start)}</p>
                            </button>
                            <button type="button" onClick={() => loopSection(sectionIndex)} disabled={sectionIndex >= currentSections.length - 1} className="rounded-xl border border-fuchsia-400/20 bg-fuchsia-400/10 text-[9px] font-black uppercase tracking-wide text-fuchsia-200 hover:bg-fuchsia-400/20 disabled:cursor-not-allowed disabled:opacity-25">Loop</button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-3 rounded-xl border border-amber-400/15 bg-amber-400/[0.05] p-3 text-[10px] font-bold text-amber-200">Esta canción no tiene secciones guardadas. Configúrala desde Administración antes del servicio.</div>
                    )}
                    {sectionError && <div className="mt-3 flex gap-2 rounded-xl border border-red-400/20 bg-red-400/[0.07] p-3 text-red-200"><AlertTriangle size={15} className="mt-0.5 shrink-0" /><p className="text-[10px] font-bold leading-relaxed">{sectionError}</p></div>}
                  </div>
                )}

                {standaloneSongMode && (
                  <div className="mt-3 rounded-2xl border border-sky-400/20 bg-sky-400/[0.04] p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-sky-300">Timeline de preparación</p>
                        <p className="mt-1 text-[10px] font-semibold leading-relaxed text-zinc-500">Waveform real de los stems cargados, grid de compases y secciones del Live Map. Toca la línea para moverte por la canción.</p>
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        <span className={'rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-wide ' + (waveformPeaks.length > 0 ? 'border-sky-400/25 bg-sky-400/10 text-sky-200' : 'border-white/10 bg-black/20 text-zinc-600')}>
                          {waveformPeaks.length > 0 ? 'Waveform lista' : loadingAudio ? 'Analizando audio' : 'Sin waveform'}
                        </span>
                        <span className="rounded-full border border-white/10 bg-black/20 px-2 py-1 font-mono text-[9px] font-black text-zinc-500">{timelineBars.length} marcas de grid</span>
                        <span className="rounded-full border border-violet-400/20 bg-violet-400/10 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-violet-200">Arrastra · snap 1 compás</span>
                        <button
                          type="button"
                          onClick={undoTimelineSectionChange}
                          disabled={timelineHistoryPast.length === 0 || Boolean(timelineDragPreview)}
                          className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[9px] font-black uppercase tracking-wide text-zinc-300 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-25"
                          title="Deshacer último movimiento de sección"
                        >
                          ↶ <span className="hidden sm:inline">Deshacer</span>{timelineHistoryPast.length > 0 ? ' ' + timelineHistoryPast.length : ''}
                        </button>
                        <button
                          type="button"
                          onClick={redoTimelineSectionChange}
                          disabled={timelineHistoryFuture.length === 0 || Boolean(timelineDragPreview)}
                          className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[9px] font-black uppercase tracking-wide text-zinc-300 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-25"
                          title="Rehacer movimiento de sección"
                        >
                          ↷ <span className="hidden sm:inline">Rehacer</span>{timelineHistoryFuture.length > 0 ? ' ' + timelineHistoryFuture.length : ''}
                        </button>
                      </div>
                    </div>

                    <div
                      ref={preparationTimelineRef}
                      className="relative mt-4 h-44 w-full cursor-crosshair overflow-hidden rounded-2xl border border-white/10 bg-black/35 select-none"
                      onClick={seekPreparationTimeline}
                      title="Toca para mover la reproducción · arrastra una sección para cambiar su compás"
                    >
                      <div className="absolute inset-x-0 top-8 bottom-7 flex items-center gap-px px-1 opacity-80">
                        {waveformPeaks.length > 0 ? waveformPeaks.map((peak, index) => (
                          <span
                            key={index}
                            className="min-w-0 flex-1 rounded-full bg-sky-300/45"
                            style={{ height: Math.max(6, Math.round(peak * 92)) + '%' }}
                          />
                        )) : (
                          <div className="flex h-full w-full items-center justify-center text-[10px] font-bold text-zinc-700">
                            {loadingAudio ? 'Generando waveform…' : 'Carga una canción con audio para visualizar la forma de onda.'}
                          </div>
                        )}
                      </div>

                      {timelineBars.map((tick) => {
                        const left = timelineDuration > 0 ? (tick.time / timelineDuration) * 100 : 0;
                        return (
                          <div key={tick.bar} className="pointer-events-none absolute inset-y-0" style={{ left: Math.min(100, Math.max(0, left)) + '%' }}>
                            <div className={'h-full border-l ' + (tick.major ? 'border-white/15' : 'border-white/[0.045]')} />
                            {tick.major && <span className="absolute bottom-1 left-1 whitespace-nowrap font-mono text-[8px] font-bold text-zinc-700">C{tick.bar}</span>}
                          </div>
                        );
                      })}

                      {currentSections.map((section, sectionIndex) => {
                        const preview = timelineDragPreview?.sectionId === section.id ? timelineDragPreview : null;
                        const visibleStart = preview ? preview.start : section.start;
                        const visibleBar = preview ? preview.bar : section.bar;
                        const left = timelineDuration > 0 ? (visibleStart / timelineDuration) * 100 : 0;
                        const active = currentLiveSection?.id === section.id;
                        const dragging = Boolean(preview);
                        return (
                          <button
                            key={section.id}
                            type="button"
                            onClick={(event) => event.stopPropagation()}
                            onPointerDown={(event) => handleTimelineSectionPointerDown(event, section)}
                            onPointerMove={(event) => handleTimelineSectionPointerMove(event, section)}
                            onPointerUp={(event) => handleTimelineSectionPointerEnd(event, section)}
                            onPointerCancel={(event) => handleTimelineSectionPointerEnd(event, section, true)}
                            className="absolute inset-y-0 z-10 w-9 -translate-x-1/2 cursor-ew-resize touch-none focus:outline-none"
                            style={{ left: Math.min(100, Math.max(0, left)) + '%' }}
                            title={'Arrastra ' + section.label + ' · compás ' + visibleBar + ' · toque corto para ir'}
                          >
                            <span className={'absolute inset-y-0 left-1/2 w-px -translate-x-1/2 ' + (dragging ? 'bg-sky-200 shadow-[0_0_12px_rgba(186,230,253,.95)]' : active ? 'bg-emerald-300' : 'bg-violet-300/75')} />
                            <span className={'absolute left-1/2 max-w-[118px] -translate-x-1/2 truncate rounded-md border px-1.5 py-1 text-[8px] font-black shadow-lg ' + (dragging ? 'top-2 border-sky-200/60 bg-sky-300/25 text-sky-50' : active ? 'top-2 border-emerald-300/40 bg-emerald-300/20 text-emerald-100' : sectionIndex % 2 === 0 ? 'top-2 border-violet-300/30 bg-violet-400/15 text-violet-100' : 'top-8 border-violet-300/30 bg-violet-400/15 text-violet-100')}>
                              {section.label}{dragging ? ' · C' + visibleBar : ''}
                            </span>
                          </button>
                        );
                      })}

                      {timelineDuration > 0 && (
                        <div
                          className="pointer-events-none absolute inset-y-0 z-20 w-0.5 bg-emerald-300 shadow-[0_0_12px_rgba(110,231,183,.9)]"
                          style={{ left: Math.min(100, Math.max(0, (playback.currentTime / timelineDuration) * 100)) + '%' }}
                        >
                          <span className="absolute left-1/2 top-0 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-emerald-300" />
                        </div>
                      )}
                    </div>

                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 font-mono text-[9px] font-bold text-zinc-600">
                      <span>0:00</span>
                      <span>Playhead {formatTime(playback.currentTime)} · Compás {musicalPosition.beforeStart ? 'PRE' : (musicalPosition.bar || '--')}</span>
                      <span>{formatTime(timelineDuration)}</span>
                    </div>
                    <p className="mt-2 text-[9px] font-semibold text-zinc-700">2K-D3: arrastra el marcador de una sección con snap a compás. Si te equivocas, usa Deshacer/Rehacer antes o después de guardar; cada restauración vuelve a dejar el Live Map como cambio pendiente.</p>
                  </div>
                )}

                {standaloneSongMode && (
                <div className="mt-3 rounded-2xl border border-violet-400/20 bg-violet-400/[0.045] p-4">
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-300">Secciones Live</p>
                      <p className="mt-1 text-[10px] font-semibold leading-relaxed text-zinc-500">Hazlo simple: cuando llegues al inicio de una parte, toca su nombre. Marca y ajusta la estructura. Cuando esté correcta, guarda el Live Map para reutilizarlo en cualquier setlist.</p>
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

                  <div className="mt-4 flex flex-col gap-3 rounded-xl border border-emerald-400/15 bg-emerald-400/[0.045] p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-300">Live Map de la canción</p>
                        <span className={'rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wide ' + (currentSong?.livePlayback && !liveMapDirty ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200' : 'border-amber-400/25 bg-amber-400/10 text-amber-200')}>
                          {currentSong?.livePlayback && !liveMapDirty ? 'Guardado' : currentSong?.livePlayback ? 'Cambios sin guardar' : 'Sin guardar'}
                        </span>
                      </div>
                      <p className="mt-1 text-[10px] font-semibold text-zinc-500">Guarda BPM, compás, alineación, secciones y la mezcla completa directamente en la canción.</p>
                      {liveMapNotice && <p className="mt-1 text-[10px] font-bold text-zinc-300">{liveMapNotice}</p>}
                    </div>
                    <button
                      type="button"
                      onClick={saveLiveMap}
                      disabled={savingLiveMap || !currentBpm || Boolean(editingSectionId) || (!liveMapDirty && Boolean(currentSong?.livePlayback))}
                      className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-400 px-4 py-2.5 text-[10px] font-black uppercase tracking-wide text-zinc-950 hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-500"
                    >
                      {savingLiveMap ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                      {savingLiveMap ? 'Guardando...' : 'Guardar Live Map'}
                    </button>
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
                )}

                {liveRunnerMode && (
                  <div className="mt-5 hidden rounded-3xl border border-emerald-400/20 bg-emerald-400/[0.055] p-4 xl:block">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-300">Operación Live</p>
                        <p className="mt-1 text-[10px] font-semibold text-zinc-500">Controles grandes para reducir toques accidentales durante el servicio.</p>
                      </div>
                      <div className="font-mono text-sm font-black text-zinc-300">{formatTime(playback.currentTime)} / {formatTime(playback.duration)}</div>
                    </div>
                    {navigationNotice && (
                      <div className="mt-3 flex items-center gap-2 rounded-xl border border-amber-400/25 bg-amber-400/[0.07] px-3 py-2 text-[10px] font-bold text-amber-200">
                        <AlertTriangle size={14} className="shrink-0" />
                        {navigationNotice}
                      </div>
                    )}
                    <div className="mt-4 grid min-w-0 grid-cols-[52px_52px_minmax(0,1fr)_52px] items-center gap-2 sm:grid-cols-[60px_60px_minmax(120px,1fr)_60px] sm:gap-3">
                      <button type="button" onClick={() => changeSong(currentIndex - 1)} disabled={currentIndex === 0} className="flex h-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10 disabled:opacity-25" title="Canción anterior"><SkipBack size={22} /></button>
                      <button type="button" onClick={stopPlayback} disabled={loadingAudio || playback.stems.length === 0} className="flex h-14 items-center justify-center rounded-2xl border border-red-400/20 bg-red-400/10 text-red-200 hover:bg-red-400/20 disabled:opacity-25" title="Stop"><Square size={20} fill="currentColor" /></button>
                      <button type="button" onClick={togglePlay} disabled={loadingAudio || Boolean(audioError) || playback.stems.length === 0} className="flex h-16 min-w-0 items-center justify-center gap-2 overflow-hidden rounded-2xl bg-emerald-400 px-2 text-xs font-black uppercase tracking-[0.08em] text-zinc-950 hover:bg-emerald-300 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-500 sm:gap-3 sm:px-5 sm:text-sm sm:tracking-[0.12em]">
                        {loadingAudio ? <Loader2 size={24} className="animate-spin" /> : playback.playing ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" />}
                        {loadingAudio ? 'Cargando' : playback.playing ? 'Pausa' : 'Play'}
                      </button>
                      <button type="button" onClick={() => changeSong(currentIndex + 1)} disabled={currentIndex >= playlist.length - 1} className="flex h-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10 disabled:opacity-25" title="Canción siguiente"><SkipForward size={22} /></button>
                    </div>
                  </div>
                )}



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

{standaloneSongMode && (
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
                )}

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

{standaloneSongMode && (
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
          )}
        </section>

        <aside className={`order-3 rounded-3xl border border-white/10 bg-white/[0.035] p-3 xl:sticky xl:top-[82px] xl:h-[calc(100vh-102px)] xl:overflow-hidden ${liveRunnerMode ? 'hidden xl:block' : ''}`}>
          <div className="mb-3 flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <SlidersHorizontal size={16} className="text-blue-300" />
              <h2 className="text-xs font-black uppercase tracking-[0.16em] text-zinc-300">{liveRunnerMode ? 'Mixer Live' : 'Mixer'}</h2>
            </div>
            <span className="text-[10px] font-bold text-zinc-600">{playback.stems.length} stems</span>
          </div>

          {currentSong?.livePlayback?.mixer && (
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.05] p-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-emerald-300">Mezcla guardada</p>
                <p className="mt-1 text-[9px] font-semibold text-zinc-600">Volumen, Mute, Solo y Master forman parte del Live Map.</p>
              </div>
              <button type="button" onClick={restoreSavedMixer} disabled={playback.stems.length === 0} className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-[9px] font-black uppercase tracking-wide text-emerald-200 hover:bg-emerald-400/20 disabled:opacity-30">Restaurar mezcla guardada</button>
            </div>
          )}

          {playback.stems.some((stem) => stem.solo) && (
            <div className="mb-3 flex gap-2 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] p-3 text-amber-200">
              <AlertTriangle size={14} className="shrink-0" />
              <p className="text-[9px] font-bold leading-relaxed">Hay uno o más canales en Solo. Si guardas el Live Map, ese estado se restaurará la próxima vez.</p>
            </div>
          )}

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
