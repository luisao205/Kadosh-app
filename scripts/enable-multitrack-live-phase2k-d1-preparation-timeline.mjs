import fs from 'node:fs';

const componentPath = 'src/components/live/MultitrackLive.jsx';
const enginePath = 'src/utils/multitrackPlaybackEngine.js';

const readNormalized = (path) => {
  const raw = fs.readFileSync(path, 'utf8');
  return {
    raw,
    eol: raw.includes('\r\n') ? '\r\n' : '\n',
    text: raw.replace(/\r\n/g, '\n'),
  };
};

const componentFile = readNormalized(componentPath);
const engineFile = readNormalized(enginePath);
let component = componentFile.text;
let engine = engineFile.text;
let changes = 0;

const replaceOnce = (source, needle, replacement, label) => {
  if (source.includes(replacement)) {
    console.log(`[skip] ${label}: ya aplicado.`);
    return source;
  }
  const index = source.indexOf(needle);
  if (index === -1) throw new Error(`No se encontró: ${label}`);
  changes += 1;
  console.log(`[ok] ${label}`);
  return source.slice(0, index) + replacement + source.slice(index + needle.length);
};

engine = replaceOnce(
  engine,
  `  getShortestStemDuration() {
    if (this.stems.length === 0) return 0;
    return Math.min(...this.stems.map((stem) => stem.buffer.duration));
  }
`,
  `  getShortestStemDuration() {
    if (this.stems.length === 0) return 0;
    return Math.min(...this.stems.map((stem) => stem.buffer.duration));
  }

  getWaveformPeaks(sampleCount = 180) {
    if (this.stems.length === 0) return [];

    const count = Math.round(clamp(Number(sampleCount) || 180, 48, 320));
    const peaks = new Array(count).fill(0);

    this.stems.forEach((stem) => {
      const buffer = stem.buffer;
      const channels = Math.max(1, Math.min(2, buffer.numberOfChannels || 1));

      for (let bucket = 0; bucket < count; bucket += 1) {
        const from = Math.floor((bucket / count) * buffer.length);
        const to = Math.max(from + 1, Math.floor(((bucket + 1) / count) * buffer.length));
        const step = Math.max(1, Math.floor((to - from) / 48));
        let localPeak = 0;

        for (let channel = 0; channel < channels; channel += 1) {
          const data = buffer.getChannelData(channel);
          for (let sample = from; sample < to; sample += step) {
            localPeak = Math.max(localPeak, Math.abs(data[sample] || 0));
          }
        }

        peaks[bucket] += localPeak / channels;
      }
    });

    const stemCount = Math.max(1, this.stems.length);
    const averaged = peaks.map((value) => value / stemCount);
    const maxPeak = Math.max(...averaged, 0.0001);
    return averaged.map((value) => clamp(value / maxPeak, 0, 1));
  }
`,
  'extracción ligera de waveform desde AudioBuffer'
);

component = replaceOnce(
  component,
  `  const [playback, setPlayback] = useState(EMPTY_PLAYBACK);`,
  `  const [playback, setPlayback] = useState(EMPTY_PLAYBACK);
  const [waveformPeaks, setWaveformPeaks] = useState([]);`,
  'estado waveform'
);

component = replaceOnce(
  component,
  `    setLoadProgress({ completed: 0, total: getSongAudioCount(currentSong), cacheHits: 0 });
    setPlayback(EMPTY_PLAYBACK);`,
  `    setLoadProgress({ completed: 0, total: getSongAudioCount(currentSong), cacheHits: 0 });
    setPlayback(EMPTY_PLAYBACK);
    setWaveformPeaks([]);`,
  'limpieza waveform al cambiar canción'
);

component = replaceOnce(
  component,
  `      setStemErrors(result.errors || []);
      engineRef.current.applyMixerPreset(currentSong?.livePlayback?.mixer);
      setPlayback(engineRef.current.getState());`,
  `      setStemErrors(result.errors || []);
      engineRef.current.applyMixerPreset(currentSong?.livePlayback?.mixer);
      setWaveformPeaks(engineRef.current.getWaveformPeaks(180));
      setPlayback(engineRef.current.getState());`,
  'generación waveform al cargar audio'
);

component = replaceOnce(
  component,
  `  const currentSectionIndex = getSectionIndexAtTime(playback.currentTime);
  const currentLiveSection = currentSectionIndex >= 0 ? currentSections[currentSectionIndex] : null;
  const activeLoopSectionIndex = playback.loop`,
  `  const currentSectionIndex = getSectionIndexAtTime(playback.currentTime);
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
  const activeLoopSectionIndex = playback.loop`,
  'modelo de timeline y grid de compases'
);

component = replaceOnce(
  component,
  `  const seekPlayback = async (event) => {
    setPendingSectionAction(null);
    setNavigationNotice('');
    await engineRef.current.seek(Number(event.target.value));
    setPlayback(engineRef.current.getState());
  };
`,
  `  const seekPlayback = async (event) => {
    setPendingSectionAction(null);
    setNavigationNotice('');
    await engineRef.current.seek(Number(event.target.value));
    setPlayback(engineRef.current.getState());
  };

  const seekPreparationTimeline = async (event) => {
    if (loadingAudio || timelineDuration <= 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width) return;
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    setPendingSectionAction(null);
    setNavigationNotice('');
    await engineRef.current.seek(ratio * timelineDuration);
    setPlayback(engineRef.current.getState());
  };
`,
  'seek directo desde timeline'
);

const sectionsPanelMarker = `                {standaloneSongMode && (
                <div className="mt-3 rounded-2xl border border-violet-400/20 bg-violet-400/[0.045] p-4">`;

if (!component.includes('Timeline de preparación')) {
  const index = component.indexOf(sectionsPanelMarker);
  if (index === -1) throw new Error('No se encontró el panel Secciones Live para insertar el timeline.');

  const timelineBlock = `                {standaloneSongMode && (
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
                      </div>
                    </div>

                    <div
                      className="relative mt-4 h-44 w-full cursor-crosshair overflow-hidden rounded-2xl border border-white/10 bg-black/35 select-none"
                      onClick={seekPreparationTimeline}
                      title="Toca para mover la reproducción"
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
                        const left = timelineDuration > 0 ? (section.start / timelineDuration) * 100 : 0;
                        const active = currentLiveSection?.id === section.id;
                        return (
                          <button
                            key={section.id}
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              goToSection(section);
                            }}
                            className="absolute inset-y-0 z-10 w-px focus:outline-none"
                            style={{ left: Math.min(100, Math.max(0, left)) + '%' }}
                            title={'Ir a ' + section.label + ' · compás ' + section.bar}
                          >
                            <span className={'absolute inset-y-0 left-0 w-px ' + (active ? 'bg-emerald-300' : 'bg-violet-300/75')} />
                            <span className={'absolute left-1/2 max-w-[108px] -translate-x-1/2 truncate rounded-md border px-1.5 py-1 text-[8px] font-black shadow-lg ' + (active ? 'top-2 border-emerald-300/40 bg-emerald-300/20 text-emerald-100' : sectionIndex % 2 === 0 ? 'top-2 border-violet-300/30 bg-violet-400/15 text-violet-100' : 'top-8 border-violet-300/30 bg-violet-400/15 text-violet-100')}>
                              {section.label}
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
                    <p className="mt-2 text-[9px] font-semibold text-zinc-700">2K-D1: visualización y navegación. En el siguiente paso los marcadores se podrán arrastrar con snap exacto al compás.</p>
                  </div>
                )}

`;

  component = component.slice(0, index) + timelineBlock + component.slice(index);
  changes += 1;
  console.log('[ok] timeline de preparación visual');
}

const requiredComponentChecks = [
  ['waveformPeaks', 'estado waveform'],
  ['seekPreparationTimeline', 'seek del timeline'],
  ['Timeline de preparación', 'panel timeline'],
  ['timelineBars.map', 'grid visual de compases'],
  ['currentSections.map', 'marcadores de secciones'],
];

for (const [needle, label] of requiredComponentChecks) {
  if (!component.includes(needle)) throw new Error(`Validación final componente: falta ${label}.`);
}
if (!engine.includes('getWaveformPeaks(sampleCount = 180)')) {
  throw new Error('Validación final motor: falta getWaveformPeaks.');
}

fs.writeFileSync(componentPath, component.replace(/\n/g, componentFile.eol), 'utf8');
fs.writeFileSync(enginePath, engine.replace(/\n/g, engineFile.eol), 'utf8');

console.log(`Multitrack Live Fase 2K-D1 aplicada: waveform real, timeline, playhead, grid y marcadores (${changes} ajuste(s)).`);
