import { useEffect, useMemo, useState } from 'react';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { collection, onSnapshot } from 'firebase/firestore';
import { FileText, Search, X } from 'lucide-react';
import { db } from '../../config/firebase';
import { getSongBaseKey } from '../../utils/songAssignments';
import { getSongPreviewLines, printSongPdf, SONG_PRINT_MODES } from '../../utils/songPrint';
import { useFeedback } from '../ui/FeedbackProvider';

const VIEW_TABS = [
  { id: SONG_PRINT_MODES.LYRICS, label: 'LETRA' },
  { id: SONG_PRINT_MODES.CHORDS, label: 'ACORDES' },
  { id: SONG_PRINT_MODES.COMBINED, label: 'LETRA + ACORDES' }
];

const PDF_ACTIONS = [
  { id: SONG_PRINT_MODES.LYRICS, label: 'PDF — Solo letra' },
  { id: SONG_PRINT_MODES.CHORDS, label: 'PDF — Solo acordes' },
  { id: SONG_PRINT_MODES.COMBINED, label: 'PDF — Letra + acordes' },
  { id: SONG_PRINT_MODES.STRUCTURE, label: 'PDF — Solo estructura' }
];

const useBrowserPathname = () => {
  const [pathname, setPathname] = useState(() => window.location.pathname);

  useEffect(() => {
    const updatePathname = () => setPathname(window.location.pathname);
    const originalPushState = window.history.pushState;
    const originalReplaceState = window.history.replaceState;

    const wrappedPushState = function wrappedPushState(...args) {
      const result = originalPushState.apply(this, args);
      updatePathname();
      return result;
    };
    const wrappedReplaceState = function wrappedReplaceState(...args) {
      const result = originalReplaceState.apply(this, args);
      updatePathname();
      return result;
    };

    window.history.pushState = wrappedPushState;
    window.history.replaceState = wrappedReplaceState;
    window.addEventListener('popstate', updatePathname);

    return () => {
      if (window.history.pushState === wrappedPushState) window.history.pushState = originalPushState;
      if (window.history.replaceState === wrappedReplaceState) window.history.replaceState = originalReplaceState;
      window.removeEventListener('popstate', updatePathname);
    };
  }, []);

  return pathname;
};

const SongExportCenter = () => {
  const { notify } = useFeedback();
  const pathname = useBrowserPathname();
  const [authorized, setAuthorized] = useState(false);
  const [songs, setSongs] = useState([]);
  const [open, setOpen] = useState(false);
  const [queryText, setQueryText] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [viewMode, setViewMode] = useState(SONG_PRINT_MODES.COMBINED);
  const [targetKey, setTargetKey] = useState('');
  const [preferences, setPreferences] = useState({ chordFormat: 'american', notation: 'sharps' });

  useEffect(() => {
    let unsubscribeSongs = null;
    const unsubscribeAuth = onAuthStateChanged(getAuth(), (firebaseUser) => {
      unsubscribeSongs?.();
      unsubscribeSongs = null;
      setAuthorized(Boolean(firebaseUser));
      if (!firebaseUser) {
        setSongs([]);
        setSelectedId('');
        setOpen(false);
        return;
      }
      unsubscribeSongs = onSnapshot(collection(db, 'canciones'), (snapshot) => {
        const nextSongs = snapshot.docs
          .map((document) => ({ id: document.id, ...document.data() }))
          .filter((song) => song.archived !== true)
          .sort((a, b) => String(a.titulo || '').localeCompare(String(b.titulo || '')));
        setSongs(nextSongs);
        setSelectedId((current) => current || nextSongs[0]?.id || '');
      }, (error) => console.warn('No se pudo cargar canciones para exportar:', error));
    });
    return () => {
      unsubscribeSongs?.();
      unsubscribeAuth();
    };
  }, []);

  useEffect(() => {
    if (pathname !== '/canciones') setOpen(false);
  }, [pathname]);

  const filteredSongs = useMemo(() => {
    const needle = queryText.trim().toLowerCase();
    if (!needle) return songs.slice(0, 80);
    return songs.filter((song) => `${song.titulo || ''} ${song.artista || ''}`.toLowerCase().includes(needle)).slice(0, 80);
  }, [queryText, songs]);

  const selectedSong = songs.find((song) => song.id === selectedId) || null;
  const effectiveKey = targetKey || (selectedSong ? getSongBaseKey(selectedSong) : '');
  const printOptions = {
    targetKey: effectiveKey,
    chordFormat: preferences.chordFormat,
    notation: preferences.notation
  };
  const previewLines = selectedSong ? getSongPreviewLines(selectedSong, { ...printOptions, mode: viewMode }) : [];

  const selectSong = (song) => {
    setSelectedId(song.id);
    setTargetKey(getSongBaseKey(song));
  };

  const exportPdf = (mode) => {
    if (!selectedSong) return;
    try {
      printSongPdf(selectedSong, { ...printOptions, mode });
    } catch (error) {
      console.error('No se pudo preparar el PDF:', error);
      notify(error.message || 'No se pudo preparar el PDF.', { type: 'error' });
    }
  };

  if (!authorized || pathname !== '/canciones') return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-5 z-[79] inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-violet-400/20 bg-zinc-900/95 px-4 text-xs font-black uppercase tracking-wide text-violet-200 shadow-2xl shadow-black/40 backdrop-blur hover:bg-zinc-800"
        aria-label="Exportar canción a PDF"
        title="Exportar PDF desde Repertorio"
      >
        <FileText size={17} /> Exportar PDF
      </button>

      {open && (
        <div className="fixed inset-0 z-[119] overflow-y-auto bg-black/75 p-4 backdrop-blur-sm md:p-8">
          <div className="mx-auto max-w-7xl rounded-[2rem] border border-white/10 bg-zinc-950 p-4 shadow-2xl md:p-6">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-violet-300">Repertorio · PDF</p>
                <h1 className="mt-1 text-3xl font-black text-white">Exportar canción</h1>
                <p className="mt-1 text-sm font-medium text-zinc-400">Letra, acordes, combinación o estructura exacta desde el repertorio.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 hover:text-white" aria-label="Cerrar"><X size={20} /></button>
            </div>

            <div className="grid gap-5 lg:grid-cols-[310px_1fr]">
              <aside className="rounded-3xl border border-white/10 bg-zinc-900/60 p-3">
                <div className="relative">
                  <Search size={16} className="absolute left-3 top-3 text-zinc-500" />
                  <input value={queryText} onChange={(event) => setQueryText(event.target.value)} placeholder="Buscar canción..." className="kp-input w-full rounded-xl py-2.5 pl-9 pr-3 text-sm" />
                </div>
                <div className="mt-3 max-h-[62vh] space-y-1 overflow-y-auto pr-1">
                  {filteredSongs.map((song) => (
                    <button key={song.id} type="button" onClick={() => selectSong(song)} className={`w-full rounded-xl px-3 py-2.5 text-left transition-colors ${song.id === selectedId ? 'bg-violet-500/15 text-violet-200' : 'text-zinc-300 hover:bg-white/5'}`}>
                      <span className="block truncate text-sm font-black">{song.titulo || 'Sin título'}</span>
                      <span className="block truncate text-[10px] font-bold text-zinc-500">{song.artista || 'Sin artista'} · {getSongBaseKey(song)}</span>
                    </button>
                  ))}
                </div>
              </aside>

              <main className="min-w-0">
                {!selectedSong ? (
                  <div className="rounded-3xl border border-dashed border-white/10 p-12 text-center text-zinc-500">Selecciona una canción.</div>
                ) : (
                  <>
                    <section className="kp-card rounded-3xl border border-white/10 p-5">
                      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                        <div className="min-w-0">
                          <h2 className="text-2xl font-black text-white">{selectedSong.titulo || 'Canción sin título'}</h2>
                          <p className="mt-1 text-sm font-bold text-zinc-400">{selectedSong.artista || 'Sin artista'} · Original {getSongBaseKey(selectedSong)}{selectedSong.bpm ? ` · ${selectedSong.bpm} BPM` : ''}</p>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-3">
                          <label className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Tono PDF
                            <input value={effectiveKey} onChange={(event) => setTargetKey(event.target.value)} className="kp-input mt-1 w-full rounded-xl px-3 py-2 text-center text-sm font-black uppercase" />
                          </label>
                          <label className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Formato
                            <select value={preferences.chordFormat} onChange={(event) => setPreferences((current) => ({ ...current, chordFormat: event.target.value }))} className="kp-input mt-1 w-full rounded-xl px-3 py-2 text-sm font-bold">
                              <option value="american">Americano</option>
                              <option value="latin">Latino</option>
                            </select>
                          </label>
                          <label className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Notación
                            <select value={preferences.notation} onChange={(event) => setPreferences((current) => ({ ...current, notation: event.target.value }))} className="kp-input mt-1 w-full rounded-xl px-3 py-2 text-sm font-bold">
                              <option value="sharps">Sostenidos #</option>
                              <option value="flats">Bemoles b</option>
                            </select>
                          </label>
                        </div>
                      </div>

                      <div className="mt-5 flex flex-wrap gap-2">
                        {VIEW_TABS.map((tab) => <button key={tab.id} type="button" onClick={() => setViewMode(tab.id)} className={`rounded-xl px-3 py-2 text-[11px] font-black tracking-wide ${viewMode === tab.id ? 'bg-violet-500 text-white' : 'border border-white/10 bg-white/[0.03] text-zinc-400 hover:text-white'}`}>{tab.label}</button>)}
                      </div>
                    </section>

                    <section className="mt-4 rounded-3xl border border-white/10 bg-white p-5 text-zinc-900 md:p-7">
                      <pre className="whitespace-pre-wrap font-mono text-sm font-semibold leading-relaxed">{previewLines.join('\n')}</pre>
                    </section>

                    <section className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                      {PDF_ACTIONS.map((action) => (
                        <button key={action.id} type="button" onClick={() => exportPdf(action.id)} className="kp-card flex items-center gap-3 rounded-2xl border border-white/10 px-4 py-3 text-left text-sm font-black text-zinc-200 hover:border-violet-400/30 hover:bg-violet-500/5">
                          <FileText size={17} className="shrink-0 text-violet-300" /> {action.label}
                        </button>
                      ))}
                    </section>
                  </>
                )}
              </main>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default SongExportCenter;
