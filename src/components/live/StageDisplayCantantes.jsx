import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { ArrowLeft, Eye, EyeOff, Link2, Minus, Plus, Settings2 } from 'lucide-react';
import { db } from '../../config/firebase';
import { transponerNota, traducirAcorde } from '../../utils/musicCore';
import { parsearCancion } from '../../utils/songParser';

const readLocal = (key, fallback) => {
  if (typeof window === 'undefined') return fallback;
  try {
    const saved = window.localStorage.getItem(key);
    return saved ? JSON.parse(saved) : fallback;
  } catch {
    return fallback;
  }
};

const writeLocal = (key, value) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Preferencia local opcional.
  }
};

const StageDisplayCantantes = ({ eventoIdOverride }) => {
  const { eventoId: routeEventoId } = useParams();
  const eventoId = eventoIdOverride || routeEventoId;
  const navigate = useNavigate();

  const [evento, setEvento] = useState(null);
  const [liveState, setLiveState] = useState(null);
  const [songData, setSongData] = useState(null);
  const [slide, setSlide] = useState(null);
  const [nextSlide, setNextSlide] = useState(null);
  const [nextSong, setNextSong] = useState(null);
  const [alerta, setAlerta] = useState(null);
  const [showLogo, setShowLogo] = useState(false);
  const [media, setMedia] = useState(null);
  const [offset, setOffset] = useState(0);
  const [formato, setFormato] = useState('american');
  const [notacion, setNotacion] = useState('sharps');
  const [hora, setHora] = useState(new Date());
  const [showChords, setShowChords] = useState(() => readLocal('singerDisplay.showChords', false));
  const [fontScale, setFontScale] = useState(() => readLocal('singerDisplay.fontScale', 1.08));
  const [showControls, setShowControls] = useState(false);
  const [viewport, setViewport] = useState(() => ({
    width: typeof window === 'undefined' ? 1024 : window.innerWidth,
    height: typeof window === 'undefined' ? 768 : window.innerHeight
  }));

  useEffect(() => writeLocal('singerDisplay.showChords', showChords), [showChords]);
  useEffect(() => writeLocal('singerDisplay.fontScale', fontScale), [fontScale]);

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
    if (!eventoId) return undefined;
    const unsub = onSnapshot(doc(db, 'eventos', eventoId), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      const nextLiveState = data.liveState || {
        activeSongId: data.proyectorSongId || null,
        activeSongTitle: '',
        activeSectionIndex: data.proyectorSlideIndex ?? -1,
        activeSectionTitle: data.proyectorSlide?.titulo || '',
        updatedBy: 'Multimedia'
      };

      setEvento(data);
      setLiveState(nextLiveState);
      setSlide(data.proyectorSlide || null);
      setNextSlide(data.proyectorNextSlide || null);
      setNextSong(data.proyectorNextSong || null);
      setAlerta(data.proyectorAlerta || null);
      setShowLogo(data.proyectorLogo || false);
      setMedia(data.proyectorMedia || null);
      setOffset(data.proyectorOffset || 0);
      if (data.preferencias?.formatoAcordes) setFormato(data.preferencias.formatoAcordes);
      if (data.preferencias?.notacion) setNotacion(data.preferencias.notacion);
    });
    return () => unsub();
  }, [eventoId]);

  useEffect(() => {
    const songId = liveState?.activeSongId;
    if (!songId) {
      setSongData(null);
      return;
    }

    let cancelled = false;
    getDoc(doc(db, 'canciones', songId)).then((songSnap) => {
      if (!cancelled && songSnap.exists()) setSongData({ id: songSnap.id, ...songSnap.data() });
    });
    return () => { cancelled = true; };
  }, [liveState?.activeSongId]);

  const secciones = useMemo(() => parsearCancion(songData?.letraRaw || ''), [songData?.letraRaw]);
  const currentIndex = liveState?.activeSectionIndex ?? -1;
  const currentSection = currentIndex >= 0 ? secciones[currentIndex] : null;
  const activeTitle = liveState?.activeSectionTitle || currentSection?.titulo || slide?.titulo || 'En vivo';
  const songTitle = liveState?.activeSongTitle || songData?.titulo || 'Kadosh App';
  const isPortraitPhone = viewport.width <= 520 && viewport.height > viewport.width;
  const isMobileLandscape = viewport.width > viewport.height && viewport.height <= 500;
  const currentCue = (currentSection?.items || []).find(item => item.type === 'cue')?.text || '';
  const nextCue = nextSlide?.cues?.[0] || '';
  const nextTitle = nextSlide?.titulo || nextSong || '--';
  const nextTextLines = nextSlide?.texto?.trim()
    ? nextSlide.texto
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean)
    : [];
  const nextDisplayLines = nextTextLines.length ? nextTextLines.slice(0, isMobileLandscape ? 1 : 2) : [nextTitle];
  const nextDisplaySuffix = nextTextLines.length > nextDisplayLines.length ? '...' : '';
  const prepareSongLabel = nextSong
    ? nextSong
        .replace(/^ðŸŽµ\s*/i, '')
        .replace(/^ðŸ“Œ\s*/i, 'Nota: ')
        .replace(/^[^\wÀ-ÿ]+/u, '')
        .trim()
    : 'Final del setlist';
  const rawPrepareLines = [prepareSongLabel];
  const prepareLines = rawPrepareLines.slice(0, 2).map((line, index) => {
    const shouldEllipsize = index === 1 && rawPrepareLines.length > 2;
    return `${line}${shouldEllipsize ? '...' : ''}`;
  });

  const lyricFontSize = isPortraitPhone
    ? `calc(clamp(1.35rem, 5.4vmin, 3.15rem) * ${fontScale})`
    : isMobileLandscape
      ? `calc(clamp(1.05rem, 5.1vmin, 2.65rem) * ${fontScale})`
    : `calc(clamp(1.7rem, 6.4vmin, 5.6rem) * ${fontScale})`;
  const chordFontSize = `calc(clamp(0.8rem, 2.5vmin, 1.7rem) * ${fontScale})`;

  const adjustFont = (delta) => {
    setFontScale(prev => Math.min(1.45, Math.max(0.82, Number((prev + delta).toFixed(2)))));
  };

  const renderLine = (line, lineIdx) => {
    if (!line || line.length === 0) return <div key={lineIdx} className="h-5 sm:h-7" />;
    return (
      <div key={lineIdx} className="flex w-full flex-wrap justify-center gap-x-2 gap-y-2 text-center sm:gap-x-4">
        {line.map((word, wordIdx) => (
          <span key={wordIdx} className="inline-flex items-end whitespace-nowrap">
            {word.map((syllable, syllableIdx) => (
              <span key={syllableIdx} className="inline-flex flex-col items-start justify-end">
                {showChords && (
                  <span className="mb-1 min-h-[1em] font-black leading-none text-yellow-300/80" style={{ fontSize: chordFontSize }}>
                    {syllable.acorde ? traducirAcorde(transponerNota(syllable.acorde, offset), formato, notacion) : ''}
                  </span>
                )}
                <span className="font-black leading-[1.08] tracking-normal text-white drop-shadow-[0_8px_30px_rgba(0,0,0,0.55)]" style={{ fontSize: lyricFontSize }}>
                  {syllable.texto}
                </span>
              </span>
            ))}
          </span>
        ))}
      </div>
    );
  };

  const contentItems = currentSection?.items?.length
    ? currentSection.items
    : (slide?.texto ? slide.texto.split('\n').map(line => ({ type: 'plain', text: line })) : []);
  const alertaData = typeof alerta === 'string' ? { text: alerta, priority: 'urgente', target: 'all' } : alerta;
  const alertIsActive = alertaData && alertaData.active !== false && (!alertaData.expiresAt || alertaData.expiresAt > Date.now());
  const shouldShowAlert = alertIsActive && (!alertaData.target || alertaData.target === 'all' || alertaData.target === 'cantantes');
  const alertPriority = alertaData?.priority || 'normal';

  return (
    <div
      className="fixed inset-0 h-[100dvh] w-screen overflow-hidden bg-zinc-950 text-white selection:bg-transparent"
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(99,102,241,0.18),transparent_34%),linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:auto,90px_90px,90px_90px]" />

      {shouldShowAlert && alertPriority === 'urgente' && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[radial-gradient(circle_at_50%_35%,rgba(248,113,113,0.92),rgba(185,28,28,0.82)_45%,rgba(69,10,10,0.72)_100%)] p-8 text-center backdrop-blur-[2px]">
          <div className="absolute inset-0 bg-black/15" />
          <div className="relative rounded-[2rem] border border-white/20 bg-black/20 px-8 py-7 shadow-2xl">
            <h2 className="mb-4 text-4xl font-black uppercase italic text-white md:text-6xl">Urgente / Atención cantantes</h2>
            <p className="text-5xl font-black text-white drop-shadow-2xl md:text-8xl">{alertaData.text}</p>
          </div>
        </div>
      )}

      {shouldShowAlert && alertPriority !== 'urgente' && (
        <div className={`fixed left-3 right-3 z-[90] mx-auto max-w-5xl rounded-3xl border px-5 py-4 text-center shadow-2xl backdrop-blur-md ${alertPriority === 'importante' ? 'top-24 border-amber-300/50 bg-amber-500/90 text-zinc-950' : 'bottom-24 border-white/10 bg-zinc-950/88 text-white'}`}>
          <p className={`text-[10px] font-black uppercase tracking-[0.24em] ${alertPriority === 'importante' ? 'text-zinc-900/70' : 'text-emerald-300'}`}>
            {alertPriority === 'importante' ? 'Atención cantantes' : 'Mensaje a cantantes'}
          </p>
          <p className="mt-1 text-2xl font-black leading-tight sm:text-4xl">{alertaData.text}</p>
        </div>
      )}

      {media && media.url && !currentSection && (
        <div className="fixed right-4 top-24 z-30 w-44 overflow-hidden rounded-2xl border border-white/20 shadow-2xl sm:w-64">
          <div className="aspect-video bg-black">
            {media.type === 'video' ? <video src={media.url} autoPlay loop muted className="h-full w-full object-cover" /> : <img src={media.url} alt="" className="h-full w-full object-cover" />}
          </div>
        </div>
      )}

      <div className="relative z-10 flex h-full min-h-0 flex-col">
        <header className="shrink-0 border-b border-white/10 bg-zinc-950/82 backdrop-blur-md">
          <div className={`flex items-center justify-between gap-3 px-3 sm:px-6 lg:px-9 ${isMobileLandscape ? 'py-1' : 'py-2 lg:py-5'}`}>
            <div className="flex min-w-0 items-center gap-3">
              <button onClick={() => navigate(`/setlist/${eventoId}`)} className={`shrink-0 rounded-full bg-white/8 text-zinc-400 hover:bg-white/12 hover:text-white ${isMobileLandscape ? 'p-1.5' : 'p-2'}`} title="Volver">
                <ArrowLeft className={isMobileLandscape ? 'h-4 w-4' : 'h-5 w-5'} />
              </button>
              <div className="min-w-0">
                <div className={`flex items-center gap-2 font-black uppercase text-red-400 ${isMobileLandscape ? 'text-[8px] tracking-[0.14em]' : 'text-[10px] tracking-[0.2em]'}`}>
                  <span className="h-2 w-2 rounded-full bg-red-500 shadow-[0_0_14px_rgba(239,68,68,0.9)] animate-pulse" />
                  En vivo
                  <span className="rounded bg-white/10 px-2 py-0.5 text-zinc-300">Cantante</span>
                </div>
                <h1 className={`truncate font-black uppercase tracking-wide text-white ${isMobileLandscape ? 'text-base' : 'text-lg sm:text-2xl lg:text-4xl'}`}>{songTitle}</h1>
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className={`font-mono font-black tabular-nums text-white ${isMobileLandscape ? 'text-lg' : 'text-2xl sm:text-4xl lg:text-6xl'}`}>
                {hora.toLocaleTimeString('es-ES', { hour12: false })}
              </div>
              <p className={`font-black uppercase tracking-widest text-zinc-500 ${isMobileLandscape ? 'text-[7px]' : 'text-[9px] sm:text-[10px]'}`}>Retorno vocal</p>
            </div>
          </div>
        </header>

        <main className={`flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden px-4 text-center sm:justify-center sm:px-8 sm:py-5 lg:px-14 [&::-webkit-scrollbar]:hidden ${isMobileLandscape ? 'justify-center py-2' : 'justify-start pb-4 pt-5'}`}>
          <div className={`mx-auto flex w-full max-w-7xl flex-col items-center ${isMobileLandscape ? 'gap-2' : 'gap-3 sm:gap-6'}`}>
            <div className={`inline-flex max-w-full rounded-full border border-blue-400/30 bg-blue-500/15 font-black uppercase text-blue-100 ${isMobileLandscape ? 'px-3 py-1 text-[10px] tracking-[0.14em]' : 'px-4 py-1.5 text-xs tracking-[0.18em] sm:text-sm sm:tracking-[0.2em]'}`}>
              {showLogo ? 'Logo en pantalla' : activeTitle}
            </div>

            {showLogo ? (
              <div className="text-4xl font-black italic text-zinc-600 sm:text-6xl lg:text-8xl">Logo Kadosh</div>
            ) : contentItems.length > 0 ? (
              <div className={`flex w-full flex-col items-center ${isMobileLandscape ? 'gap-2' : 'gap-3 sm:gap-5 lg:gap-7'}`}>
                {contentItems.map((item, idx) => {
                  if (item.type === 'cue') {
                    return (
                      <div key={idx} className="max-w-full rounded-2xl border border-violet-300/45 bg-violet-500/22 px-5 py-2.5 text-base font-black uppercase tracking-wide text-violet-50 shadow-[0_18px_45px_rgba(124,58,237,0.18)] sm:text-2xl">
                        Indicación: {item.text}
                      </div>
                    );
                  }
                  if (item.type === 'blank') return <div key={idx} className="h-4 sm:h-6" />;
                  if (item.type === 'plain') return (
                    <p key={idx} className="whitespace-pre-wrap font-black leading-[1.08] text-white" style={{ fontSize: lyricFontSize }}>{item.text}</p>
                  );
                  return renderLine(item.line, idx);
                })}
              </div>
            ) : (
              <div className="text-4xl font-black text-zinc-800 sm:text-6xl lg:text-8xl">KADOSH APP</div>
            )}
          </div>
        </main>

        <footer className={`shrink-0 border-t border-white/10 bg-zinc-950/92 px-3 shadow-[0_-14px_40px_rgba(0,0,0,0.45)] sm:px-6 lg:px-9 ${isMobileLandscape ? 'py-1.5' : 'py-2.5 lg:py-4'}`}>
          <div className={`grid gap-2 lg:grid-cols-[0.9fr_1.5fr_auto] lg:items-center ${isMobileLandscape ? 'grid-cols-2' : ''}`}>
            <div className={`min-w-0 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-3 ${isMobileLandscape ? 'py-1' : 'py-2'}`}>
              <p className="text-[9px] font-black uppercase tracking-widest text-emerald-400">{isMobileLandscape ? 'Sig.' : 'Siguiente'}</p>
              {!isMobileLandscape && nextTextLines.length > 0 && (
                <p className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[10px] font-black uppercase tracking-widest text-emerald-300/75">{nextTitle}</p>
              )}
              {nextCue && (
                <p className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[10px] font-black uppercase text-violet-200">Indicación: {nextCue}</p>
              )}
              <div className={`min-w-0 overflow-hidden font-black leading-snug text-emerald-100 ${isMobileLandscape ? 'text-sm' : 'text-base sm:text-xl'}`}>
                {nextDisplayLines.map((line, index) => (
                  <p key={`${line}-${index}`} className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                    {line}{index === nextDisplayLines.length - 1 ? nextDisplaySuffix : ''}
                  </p>
                ))}
              </div>
            </div>
            <div className={`min-w-0 rounded-2xl border border-indigo-400/20 bg-indigo-500/10 px-3 ${isMobileLandscape ? 'py-1' : 'py-2'}`}>
              <p className="text-[9px] font-black uppercase tracking-widest text-indigo-300">Preparar</p>
              <div className={`mt-0.5 flex min-w-0 max-w-full flex-col overflow-hidden font-black leading-snug text-indigo-50 ${isMobileLandscape ? 'text-sm' : 'gap-0.5 text-sm sm:text-xl'}`}>
                {(isMobileLandscape ? prepareLines.slice(0, 1) : prepareLines).map((line, index) => (
                  <p key={`${line}-${index}`} className="min-w-0 max-w-full overflow-hidden text-ellipsis whitespace-nowrap">{line}</p>
                ))}
              </div>
            </div>
            {(currentCue || nextCue) && (
              <div className={`rounded-2xl border border-violet-400/25 bg-violet-500/12 px-3 lg:min-w-56 ${isMobileLandscape ? 'col-span-2 py-1' : 'py-2'}`}>
                <p className="text-[9px] font-black uppercase tracking-widest text-violet-300">Indicación</p>
                <p className="truncate text-sm font-black text-violet-50 sm:text-xl">{nextCue || currentCue}</p>
              </div>
            )}
          </div>
        </footer>
      </div>

      <div className="fixed bottom-3 right-3 z-40 flex items-center gap-2">
        {showControls && (
          <div className="flex items-center gap-1 rounded-2xl border border-white/10 bg-zinc-900/95 p-1.5 shadow-2xl backdrop-blur-md">
            <button onClick={() => adjustFont(-0.08)} className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-800 text-zinc-200" title="Reducir letra"><Minus size={17} /></button>
            <button onClick={() => adjustFont(0.08)} className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-800 text-zinc-200" title="Aumentar letra"><Plus size={17} /></button>
            <button onClick={() => setShowChords(prev => !prev)} className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-800 text-zinc-200" title={showChords ? 'Ocultar acordes' : 'Mostrar acordes'}>
              {showChords ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
            <button onClick={() => setOffset(0)} className="flex h-10 items-center justify-center rounded-xl bg-zinc-800 px-3 text-[10px] font-black uppercase text-zinc-200" title="Volver al tono original">
              Tono
            </button>
          </div>
        )}
        <button onClick={() => setShowControls(prev => !prev)} className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-zinc-900/95 text-zinc-200 shadow-2xl backdrop-blur-md" title="Controles">
          <Settings2 size={18} />
        </button>
      </div>
    </div>
  );
};

export default StageDisplayCantantes;
