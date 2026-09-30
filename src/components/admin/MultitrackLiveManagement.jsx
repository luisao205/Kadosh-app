import React, { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Download,
  ExternalLink,
  Loader2,
  Music2,
  Radio,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { db } from '../../config/firebase';
import { getSongSearchMatch } from '../../utils/songSearch';
import { getEventSetlistItems } from '../../utils/setlistUtils';
import { formatEventDate, formatEventTime, parseAppDate } from '../../utils/dateUtils';
import {
  getMultitrackSetlistReadiness,
  isMultitrackCacheSupported,
  prepareMultitrackSetlist,
} from '../../utils/multitrackAudioCache';

const getAudioCount = (song) => {
  if (Array.isArray(song?.multitracks) && song.multitracks.length > 0) {
    return song.multitracks.filter((track) => track?.url).length;
  }
  return song?.audioUrl ? 1 : 0;
};

const getLiveMapStatus = (song) => {
  const map = song?.livePlayback;
  const audioCount = getAudioCount(song);
  if (audioCount === 0) return 'no-audio';
  if (!map || typeof map !== 'object') return 'pending';
  if (!(Number(map.bpm) > 0)) return 'pending';
  if (!Array.isArray(map.sections) || map.sections.length === 0) return 'partial';
  return 'ready';
};

const FILTERS = [
  { id: 'all', label: 'Todas' },
  { id: 'audio', label: 'Con audio' },
  { id: 'ready', label: 'Live Map listo' },
  { id: 'pending', label: 'Falta preparar' },
];

const getEventSongs = (event, songsById) => getEventSetlistItems(event)
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

const MultitrackLiveManagement = () => {
  const navigate = useNavigate();
  const [songs, setSongs] = useState([]);
  const [events, setEvents] = useState([]);
  const [loadingSongs, setLoadingSongs] = useState(true);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [activeTab, setActiveTab] = useState('songs');
  const [search, setSearch] = useState('');
  const [setlistSearch, setSetlistSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [setlistReadiness, setSetlistReadiness] = useState({});
  const [checkingSetlists, setCheckingSetlists] = useState(false);
  const [preparingEventId, setPreparingEventId] = useState('');
  const [prepareProgress, setPrepareProgress] = useState({});
  const [prepareResults, setPrepareResults] = useState({});

  useEffect(() => {
    const unsubscribeSongs = onSnapshot(collection(db, 'canciones'), (snapshot) => {
      const next = snapshot.docs
        .map((songDoc) => ({ id: songDoc.id, ...songDoc.data() }))
        .sort((a, b) => String(a.titulo || '').localeCompare(String(b.titulo || ''), 'es'));
      setSongs(next);
      setLoadingSongs(false);
    }, () => {
      setSongs([]);
      setLoadingSongs(false);
    });

    const unsubscribeEvents = onSnapshot(collection(db, 'eventos'), (snapshot) => {
      const next = snapshot.docs
        .map((eventDoc) => ({ id: eventDoc.id, ...eventDoc.data() }))
        .sort((a, b) => {
          const aDate = parseAppDate(a.fecha)?.getTime() || Number.MAX_SAFE_INTEGER;
          const bDate = parseAppDate(b.fecha)?.getTime() || Number.MAX_SAFE_INTEGER;
          return aDate - bDate;
        });
      setEvents(next);
      setLoadingEvents(false);
    }, () => {
      setEvents([]);
      setLoadingEvents(false);
    });

    return () => {
      unsubscribeSongs();
      unsubscribeEvents();
    };
  }, []);

  const songsById = useMemo(() => Object.fromEntries(songs.map((song) => [song.id, song])), [songs]);

  const visibleSongs = useMemo(() => songs
    .map((song) => ({
      song,
      searchMatch: getSongSearchMatch(song, search),
      status: getLiveMapStatus(song),
      audioCount: getAudioCount(song),
    }))
    .filter(({ searchMatch }) => searchMatch.matches)
    .filter(({ status, audioCount }) => {
      if (filter === 'audio') return audioCount > 0;
      if (filter === 'ready') return status === 'ready';
      if (filter === 'pending') return status !== 'ready';
      return true;
    }), [songs, search, filter]);

  const counts = useMemo(() => {
    const withAudio = songs.filter((song) => getAudioCount(song) > 0).length;
    const ready = songs.filter((song) => getLiveMapStatus(song) === 'ready').length;
    return { total: songs.length, withAudio, ready };
  }, [songs]);

  const eventCards = useMemo(() => events.map((event) => {
    const eventSongs = getEventSongs(event, songsById);
    const totalSongs = eventSongs.length;
    const readyMaps = eventSongs.filter((song) => getLiveMapStatus(song) === 'ready').length;
    const noAudioSongs = eventSongs.filter((song) => getAudioCount(song) === 0).length;
    const incompleteMaps = eventSongs.filter((song) => {
      const status = getLiveMapStatus(song);
      return status === 'pending' || status === 'partial';
    }).length;
    const readiness = setlistReadiness[event.id] || null;
    const readyForLive = Boolean(
      totalSongs > 0
      && readyMaps === totalSongs
      && readiness?.supported
      && readiness?.pendingAudio === 0
      && readiness?.noAudioSongs === 0
    );

    return {
      event,
      eventSongs,
      totalSongs,
      readyMaps,
      noAudioSongs,
      incompleteMaps,
      readiness,
      readyForLive,
    };
  }), [events, songsById, setlistReadiness]);

  const visibleEventCards = useMemo(() => {
    const query = setlistSearch.trim().toLocaleLowerCase('es');
    if (!query) return eventCards;
    return eventCards.filter(({ event }) => [event?.titulo, event?.lugar, event?.tipoEvento]
      .filter(Boolean)
      .some((value) => String(value).toLocaleLowerCase('es').includes(query)));
  }, [eventCards, setlistSearch]);

  useEffect(() => {
    if (loadingSongs || loadingEvents || events.length === 0) return undefined;
    let cancelled = false;

    const check = async () => {
      setCheckingSetlists(true);
      const entries = await Promise.all(events.map(async (event) => {
        const eventSongs = getEventSongs(event, songsById);
        try {
          const readiness = await getMultitrackSetlistReadiness(eventSongs);
          return [event.id, readiness];
        } catch (error) {
          return [event.id, {
            supported: isMultitrackCacheSupported(),
            error: error?.message || 'No se pudo revisar la preparación local.',
            totalSongs: eventSongs.length,
            songsWithAudio: eventSongs.filter((song) => getAudioCount(song) > 0).length,
            readySongs: 0,
            partialSongs: 0,
            pendingSongs: 0,
            noAudioSongs: eventSongs.filter((song) => getAudioCount(song) === 0).length,
            totalAudio: 0,
            cachedAudio: 0,
            pendingAudio: 0,
            songs: [],
          }];
        }
      }));

      if (!cancelled) {
        setSetlistReadiness(Object.fromEntries(entries));
        setCheckingSetlists(false);
      }
    };

    check();
    return () => { cancelled = true; };
  }, [events, songsById, loadingEvents, loadingSongs]);

  const handlePrepareEvent = async (card) => {
    if (!card || preparingEventId || card.eventSongs.length === 0 || !isMultitrackCacheSupported()) return;

    const eventId = card.event.id;
    setPreparingEventId(eventId);
    setPrepareResults((previous) => ({ ...previous, [eventId]: null }));
    setPrepareProgress((previous) => ({
      ...previous,
      [eventId]: { completed: 0, total: 0, cached: 0, downloaded: 0, errors: 0 },
    }));

    try {
      const result = await prepareMultitrackSetlist(card.eventSongs, (progress) => {
        setPrepareProgress((previous) => ({ ...previous, [eventId]: progress }));
      }, { concurrency: 3 });
      const readiness = await getMultitrackSetlistReadiness(card.eventSongs);
      setSetlistReadiness((previous) => ({ ...previous, [eventId]: readiness }));
      setPrepareResults((previous) => ({ ...previous, [eventId]: result }));
    } catch (error) {
      setPrepareResults((previous) => ({
        ...previous,
        [eventId]: { error: error?.message || 'No se pudo preparar el setlist.' },
      }));
    } finally {
      setPreparingEventId('');
    }
  };

  const setlistCounts = useMemo(() => ({
    total: eventCards.length,
    ready: eventCards.filter((card) => card.readyForLive).length,
    pending: eventCards.filter((card) => card.totalSongs > 0 && !card.readyForLive).length,
  }), [eventCards]);

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-400/20 bg-emerald-400/10 text-emerald-300">
              <Radio size={21} />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-400">Administración</p>
              <h1 className="text-2xl font-black tracking-tight text-white md:text-3xl">Multitrack Live</h1>
            </div>
          </div>
          <p className="mt-3 max-w-3xl text-sm font-semibold leading-relaxed text-zinc-500">
            Prepara canciones, Live Maps, mezclas y setlists antes del servicio. La preparación de audio se guarda localmente en este dispositivo.
          </p>
        </div>

        {activeTab === 'songs' ? (
          <div className="grid grid-cols-3 gap-2 sm:min-w-[360px]">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-3 text-center">
              <p className="text-xl font-black text-white">{counts.total}</p>
              <p className="mt-1 text-[9px] font-black uppercase tracking-wider text-zinc-600">Canciones</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-3 text-center">
              <p className="text-xl font-black text-blue-200">{counts.withAudio}</p>
              <p className="mt-1 text-[9px] font-black uppercase tracking-wider text-zinc-600">Con audio</p>
            </div>
            <div className="rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.05] p-3 text-center">
              <p className="text-xl font-black text-emerald-300">{counts.ready}</p>
              <p className="mt-1 text-[9px] font-black uppercase tracking-wider text-zinc-600">Listas</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:min-w-[360px]">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-3 text-center">
              <p className="text-xl font-black text-white">{setlistCounts.total}</p>
              <p className="mt-1 text-[9px] font-black uppercase tracking-wider text-zinc-600">Setlists</p>
            </div>
            <div className="rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.05] p-3 text-center">
              <p className="text-xl font-black text-emerald-300">{setlistCounts.ready}</p>
              <p className="mt-1 text-[9px] font-black uppercase tracking-wider text-zinc-600">Listos</p>
            </div>
            <div className="rounded-2xl border border-amber-400/15 bg-amber-400/[0.05] p-3 text-center">
              <p className="text-xl font-black text-amber-300">{setlistCounts.pending}</p>
              <p className="mt-1 text-[9px] font-black uppercase tracking-wider text-zinc-600">Pendientes</p>
            </div>
          </div>
        )}
      </div>

      <div className="inline-flex rounded-2xl border border-white/10 bg-black/20 p-1">
        <button
          type="button"
          onClick={() => setActiveTab('songs')}
          className={`rounded-xl px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.14em] ${activeTab === 'songs' ? 'bg-violet-500 text-white' : 'text-zinc-500 hover:bg-white/5 hover:text-zinc-300'}`}
        >
          Canciones
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('setlists')}
          className={`rounded-xl px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.14em] ${activeTab === 'setlists' ? 'bg-emerald-500 text-zinc-950' : 'text-zinc-500 hover:bg-white/5 hover:text-zinc-300'}`}
        >
          Setlists / Preparación Live
        </button>
      </div>

      {activeTab === 'songs' ? (
        <>
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 md:p-5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-zinc-600" size={18} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por título, artista, etiqueta o una frase de la letra..."
                className="w-full rounded-2xl border border-white/10 bg-black/30 py-3.5 pl-11 pr-4 text-sm font-semibold text-white outline-none placeholder:text-zinc-700 focus:border-violet-400/35"
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {FILTERS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setFilter(item.id)}
                  className={`rounded-xl border px-3 py-2 text-[10px] font-black uppercase tracking-wide ${filter === item.id ? 'border-violet-400/35 bg-violet-400/15 text-violet-100' : 'border-white/10 bg-white/[0.03] text-zinc-500 hover:bg-white/[0.06]'}`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {loadingSongs ? (
            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-10 text-center text-sm font-bold text-zinc-500">Cargando repertorio...</div>
          ) : visibleSongs.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-white/10 p-10 text-center">
              <Music2 className="mx-auto text-zinc-700" size={34} />
              <p className="mt-3 text-sm font-black text-zinc-400">No hay canciones que coincidan.</p>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
              {visibleSongs.map(({ song, searchMatch, status, audioCount }) => {
                const sections = Array.isArray(song?.livePlayback?.sections) ? song.livePlayback.sections.length : 0;
                const savedMixer = song?.livePlayback?.mixer;
                const statusLabel = status === 'ready' ? 'Live Map listo' : status === 'partial' ? 'Mapa incompleto' : status === 'no-audio' ? 'Sin audio' : 'Falta preparar';
                return (
                  <button
                    key={song.id}
                    type="button"
                    onClick={() => navigate(`/multitrack-live/cancion/${song.id}`)}
                    className="group rounded-3xl border border-white/10 bg-white/[0.035] p-4 text-left transition hover:border-violet-400/30 hover:bg-violet-400/[0.05]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-base font-black text-white">{song.titulo || 'Sin título'}</p>
                        <p className="mt-1 truncate text-[11px] font-semibold text-zinc-600">{song.artista || 'Sin artista'} · {song.livePlayback?.bpm || song.bpm || '--'} BPM</p>
                      </div>
                      <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-wide ${status === 'ready' ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300' : status === 'no-audio' ? 'border-amber-400/20 bg-amber-400/10 text-amber-300' : 'border-violet-400/20 bg-violet-400/10 text-violet-300'}`}>
                        {statusLabel}
                      </span>
                    </div>

                    {searchMatch.field === 'lyrics' && searchMatch.snippet && (
                      <div className="mt-3 rounded-xl border border-white/8 bg-black/20 px-3 py-2 text-[10px] font-semibold leading-relaxed text-zinc-500">
                        “{searchMatch.snippet}”
                      </div>
                    )}

                    <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-xl border border-white/8 bg-black/20 p-2">
                        <p className="text-xs font-black text-zinc-200">{audioCount}</p>
                        <p className="mt-0.5 text-[8px] font-black uppercase tracking-wider text-zinc-700">Stems</p>
                      </div>
                      <div className="rounded-xl border border-white/8 bg-black/20 p-2">
                        <p className="text-xs font-black text-zinc-200">{sections}</p>
                        <p className="mt-0.5 text-[8px] font-black uppercase tracking-wider text-zinc-700">Secciones</p>
                      </div>
                      <div className="rounded-xl border border-white/8 bg-black/20 p-2">
                        <p className="flex items-center justify-center gap-1 text-xs font-black text-zinc-200">{savedMixer ? <CheckCircle2 size={13} className="text-emerald-400" /> : <SlidersHorizontal size={13} className="text-zinc-600" />}{savedMixer ? 'Sí' : 'No'}</p>
                        <p className="mt-0.5 text-[8px] font-black uppercase tracking-wider text-zinc-700">Mezcla</p>
                      </div>
                    </div>

                    {audioCount === 0 && (
                      <div className="mt-3 flex items-center gap-2 text-[10px] font-bold text-amber-300/80">
                        <AlertTriangle size={13} /> Puedes abrirla, pero necesita audio para probar el motor.
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 md:p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-zinc-600" size={18} />
                <input
                  value={setlistSearch}
                  onChange={(event) => setSetlistSearch(event.target.value)}
                  placeholder="Buscar setlist por nombre, lugar o tipo de evento..."
                  className="w-full rounded-2xl border border-white/10 bg-black/30 py-3.5 pl-11 pr-4 text-sm font-semibold text-white outline-none placeholder:text-zinc-700 focus:border-emerald-400/35"
                />
              </div>
              <div className="flex items-center gap-2 rounded-xl border border-white/8 bg-black/20 px-3 py-2 text-[10px] font-bold text-zinc-500">
                {checkingSetlists ? <Loader2 size={13} className="animate-spin text-blue-300" /> : <CheckCircle2 size={13} className="text-emerald-400" />}
                {checkingSetlists ? 'Revisando almacenamiento local...' : 'Estado local actualizado'}
              </div>
            </div>
            <p className="mt-3 text-[10px] font-semibold leading-relaxed text-zinc-600">
              “Listo para Live” significa que todas las canciones tienen Live Map completo, audio disponible y todos sus archivos están preparados localmente en este dispositivo.
            </p>
          </div>

          {loadingEvents || loadingSongs ? (
            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-10 text-center text-sm font-bold text-zinc-500">Cargando setlists...</div>
          ) : visibleEventCards.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-white/10 p-10 text-center">
              <CalendarDays className="mx-auto text-zinc-700" size={34} />
              <p className="mt-3 text-sm font-black text-zinc-400">No hay setlists que coincidan.</p>
            </div>
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              {visibleEventCards.map((card) => {
                const { event, eventSongs, totalSongs, readyMaps, noAudioSongs, incompleteMaps, readiness, readyForLive } = card;
                const progress = prepareProgress[event.id];
                const result = prepareResults[event.id];
                const isPreparing = preparingEventId === event.id;
                const cachedAudio = readiness?.cachedAudio || 0;
                const totalAudio = readiness?.totalAudio || eventSongs.reduce((sum, song) => sum + getAudioCount(song), 0);
                const pendingAudio = readiness?.pendingAudio ?? Math.max(0, totalAudio - cachedAudio);
                const mapPending = Math.max(0, totalSongs - readyMaps);

                return (
                  <div key={event.id} className={`rounded-3xl border p-4 md:p-5 ${readyForLive ? 'border-emerald-400/25 bg-emerald-400/[0.045]' : 'border-white/10 bg-white/[0.03]'}`}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="truncate text-lg font-black text-white">{event.titulo || 'Evento sin título'}</h2>
                          <span className={`rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-wide ${readyForLive ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300' : 'border-amber-400/20 bg-amber-400/10 text-amber-300'}`}>
                            {readyForLive ? 'Listo para Live' : totalSongs === 0 ? 'Sin canciones' : 'Falta preparar'}
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] font-semibold text-zinc-600">
                          <span className="flex items-center gap-1.5"><CalendarDays size={12} />{formatEventDate(event.fecha)}</span>
                          {formatEventTime(event.fecha) && <span className="flex items-center gap-1.5"><Clock3 size={12} />{formatEventTime(event.fecha)}</span>}
                          {event.lugar && <span className="truncate">{event.lugar}</span>}
                        </div>
                      </div>
                      <span className="shrink-0 rounded-xl border border-white/8 bg-black/20 px-3 py-2 text-[10px] font-black text-zinc-400">{totalSongs} canción{totalSongs === 1 ? '' : 'es'}</span>
                    </div>

                    <div className="mt-4 grid gap-2 sm:grid-cols-3">
                      <div className={`rounded-2xl border p-3 ${mapPending === 0 && totalSongs > 0 ? 'border-emerald-400/15 bg-emerald-400/[0.04]' : 'border-white/8 bg-black/20'}`}>
                        <p className="text-[9px] font-black uppercase tracking-wider text-zinc-600">Live Maps</p>
                        <p className="mt-1 text-base font-black text-zinc-100">{readyMaps}/{totalSongs}</p>
                        <p className="mt-1 text-[9px] font-semibold text-zinc-700">{incompleteMaps > 0 ? `${incompleteMaps} mapa(s) incompleto(s)` : mapPending > 0 ? `${mapPending} pendiente(s)` : totalSongs > 0 ? 'Estructura lista' : 'Sin canciones'}</p>
                      </div>
                      <div className={`rounded-2xl border p-3 ${pendingAudio === 0 && totalAudio > 0 ? 'border-emerald-400/15 bg-emerald-400/[0.04]' : 'border-white/8 bg-black/20'}`}>
                        <p className="text-[9px] font-black uppercase tracking-wider text-zinc-600">Audios locales</p>
                        <p className="mt-1 text-base font-black text-zinc-100">{cachedAudio}/{totalAudio}</p>
                        <p className="mt-1 text-[9px] font-semibold text-zinc-700">{pendingAudio > 0 ? `${pendingAudio} por preparar` : totalAudio > 0 ? 'Preparados en este equipo' : 'Sin archivos'}</p>
                      </div>
                      <div className={`rounded-2xl border p-3 ${noAudioSongs === 0 ? 'border-white/8 bg-black/20' : 'border-amber-400/15 bg-amber-400/[0.04]'}`}>
                        <p className="text-[9px] font-black uppercase tracking-wider text-zinc-600">Validación</p>
                        <p className="mt-1 text-base font-black text-zinc-100">{noAudioSongs === 0 ? 'OK' : noAudioSongs}</p>
                        <p className="mt-1 text-[9px] font-semibold text-zinc-700">{noAudioSongs > 0 ? 'canción(es) sin audio' : totalSongs > 0 ? 'Todas tienen audio' : 'Sin canciones'}</p>
                      </div>
                    </div>

                    {isPreparing && progress && (
                      <div className="mt-3 rounded-2xl border border-blue-400/15 bg-blue-400/[0.05] p-3">
                        <div className="flex items-center justify-between gap-3 text-[10px] font-bold">
                          <span className="flex items-center gap-2 text-blue-200"><Loader2 size={13} className="animate-spin" />Preparando setlist</span>
                          <span className="font-mono text-zinc-500">{progress.completed}/{progress.total || 0}</span>
                        </div>
                        <p className="mt-1 text-[9px] font-semibold text-zinc-600">Ya locales {progress.cached || 0} · descargados {progress.downloaded || 0} · errores {progress.errors || 0}</p>
                      </div>
                    )}

                    {!isPreparing && result?.error && (
                      <div className="mt-3 flex items-center gap-2 rounded-2xl border border-red-400/20 bg-red-400/[0.05] p-3 text-[10px] font-bold text-red-200">
                        <AlertTriangle size={13} />{result.error}
                      </div>
                    )}

                    {!isPreparing && result && !result.error && (
                      <div className={`mt-3 flex items-center gap-2 rounded-2xl border p-3 text-[10px] font-bold ${result.errors?.length ? 'border-amber-400/20 bg-amber-400/[0.05] text-amber-200' : 'border-emerald-400/20 bg-emerald-400/[0.05] text-emerald-200'}`}>
                        {result.errors?.length ? <AlertTriangle size={13} /> : <CheckCircle2 size={13} />}
                        {result.ready}/{result.total} audios preparados · {result.errors?.length || 0} error(es)
                      </div>
                    )}

                    {readiness?.error && (
                      <div className="mt-3 flex items-center gap-2 text-[10px] font-bold text-amber-300/80"><AlertTriangle size={13} />{readiness.error}</div>
                    )}

                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => handlePrepareEvent(card)}
                        disabled={!isMultitrackCacheSupported() || Boolean(preparingEventId) || totalAudio === 0 || pendingAudio === 0}
                        className="flex items-center gap-2 rounded-xl border border-blue-400/20 bg-blue-400/10 px-3 py-2.5 text-[10px] font-black uppercase tracking-wide text-blue-200 hover:bg-blue-400/20 disabled:cursor-not-allowed disabled:opacity-35"
                      >
                        {isPreparing ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                        {isPreparing ? 'Preparando...' : pendingAudio === 0 && totalAudio > 0 ? 'Audios preparados' : 'Preparar audios'}
                      </button>
                      <button
                        type="button"
                        onClick={() => navigate(`/multitrack-live/${event.id}`)}
                        disabled={totalSongs === 0}
                        className="flex items-center gap-2 rounded-xl bg-emerald-400 px-3 py-2.5 text-[10px] font-black uppercase tracking-wide text-zinc-950 hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-500"
                      >
                        <Radio size={13} /> Abrir Live
                      </button>
                      <button
                        type="button"
                        onClick={() => navigate(`/setlist/${event.id}`)}
                        className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-[10px] font-black uppercase tracking-wide text-zinc-400 hover:bg-white/10 hover:text-zinc-200"
                      >
                        <ExternalLink size={13} /> Ver setlist
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default MultitrackLiveManagement;
