import React, { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { AlertTriangle, CheckCircle2, Music2, Radio, Search, SlidersHorizontal } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { db } from '../../config/firebase';
import { getSongSearchMatch } from '../../utils/songSearch';

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

const MultitrackLiveManagement = () => {
  const navigate = useNavigate();
  const [songs, setSongs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    return onSnapshot(collection(db, 'canciones'), (snapshot) => {
      const next = snapshot.docs
        .map((songDoc) => ({ id: songDoc.id, ...songDoc.data() }))
        .sort((a, b) => String(a.titulo || '').localeCompare(String(b.titulo || ''), 'es'));
      setSongs(next);
      setLoading(false);
    }, () => {
      setSongs([]);
      setLoading(false);
    });
  }, []);

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
            Prepara el Live Map y la mezcla de cada canción antes de llevarla a un setlist. Lo que guardes aquí queda asociado a la canción.
          </p>
        </div>

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
      </div>

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

      {loading ? (
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
    </div>
  );
};

export default MultitrackLiveManagement;
