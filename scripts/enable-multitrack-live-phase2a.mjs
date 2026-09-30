import fs from 'node:fs';

const filePath = 'src/components/live/MultitrackLive.jsx';
const original = fs.readFileSync(filePath, 'utf8');
const eol = original.includes('\r\n') ? '\r\n' : '\n';
let text = original.replace(/\r\n/g, '\n');

const replaceOnce = (source, needle, replacement, label) => {
  const first = source.indexOf(needle);
  if (first === -1) throw new Error(`No se encontró el marcador: ${label}`);
  if (source.indexOf(needle, first + needle.length) !== -1) {
    throw new Error(`Marcador duplicado: ${label}`);
  }
  return source.slice(0, first) + replacement + source.slice(first + needle.length);
};

if (!text.includes("from '../../utils/musicalGrid';")) {
  text = replaceOnce(
    text,
    "} from '../../utils/multitrackAudioCache';\n\nconst EMPTY_PLAYBACK",
    "} from '../../utils/multitrackAudioCache';\nimport { getMusicalPosition } from '../../utils/musicalGrid';\n\nconst EMPTY_PLAYBACK",
    'import musicalGrid'
  );
}

if (!text.includes('const [gridOffsets, setGridOffsets]')) {
  text = replaceOnce(
    text,
    "  const [readiness, setReadiness] = useState(null);",
    "  const [readiness, setReadiness] = useState(null);\n  const [gridOffsets, setGridOffsets] = useState({});",
    'estado gridOffsets'
  );
}

if (!text.includes('const musicalPosition = useMemo')) {
  text = replaceOnce(
    text,
    "  const readinessByKey = useMemo(() => new Map(\n    (readiness?.songs || []).map((song) => [String(song.key), song])\n  ), [readiness]);",
    `  const readinessByKey = useMemo(() => new Map(\n    (readiness?.songs || []).map((song) => [String(song.key), song])\n  ), [readiness]);\n\n  const currentSongGridKey = String(currentSong?.id || currentSong?.setlistItemId || '');\n  const currentBpm = Number(currentSong?.bpm) || 0;\n  const currentBeatsPerBar = Math.max(1, Math.min(16, Math.round(\n    Number(\n      currentSong?.playbackConfig?.timeSignature?.[0]\n      || currentSong?.playbackConfig?.beatsPerBar\n      || currentSong?.beatsPerBar\n      || 4\n    ) || 4\n  )));\n  const currentGridOffset = Number(gridOffsets[currentSongGridKey]) || 0;\n  const musicalPosition = useMemo(() => getMusicalPosition({\n    time: playback.currentTime,\n    bpm: currentBpm,\n    beatsPerBar: currentBeatsPerBar,\n    gridOffsetSeconds: currentGridOffset,\n  }), [playback.currentTime, currentBpm, currentBeatsPerBar, currentGridOffset]);`,
    'cálculo reloj musical'
  );
}

if (!text.includes('const markGridStart = () =>')) {
  text = replaceOnce(
    text,
    "  const changeMasterVolume = (value) => {\n    engineRef.current.setMasterVolume(value);\n    setPlayback(engineRef.current.getState());\n  };",
    `  const changeMasterVolume = (value) => {\n    engineRef.current.setMasterVolume(value);\n    setPlayback(engineRef.current.getState());\n  };\n\n  const markGridStart = () => {\n    if (!currentSongGridKey || !currentBpm || playback.stems.length === 0) return;\n    setGridOffsets((previous) => ({\n      ...previous,\n      [currentSongGridKey]: playback.currentTime,\n    }));\n  };\n\n  const resetGridStart = () => {\n    if (!currentSongGridKey) return;\n    setGridOffsets((previous) => ({\n      ...previous,\n      [currentSongGridKey]: 0,\n    }));\n  };`,
    'acciones reloj musical'
  );
}

if (text.includes('>Fase 1.5</span>')) {
  text = replaceOnce(text, '>Fase 1.5</span>', '>Fase 2A</span>', 'etiqueta Fase 2A');
}

if (!text.includes('>Reloj musical</p>')) {
  const marker = '                <div className="mt-7">';
  const block = `                <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">\n                  <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/[0.05] p-4">\n                    <div className="flex flex-wrap items-start justify-between gap-3">\n                      <div>\n                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-300">Reloj musical</p>\n                        <p className="mt-1 text-[10px] font-semibold text-zinc-500">Base para compases, secciones y loops cuantizados.</p>\n                      </div>\n                      <span className="rounded-full border border-white/10 bg-black/25 px-2.5 py-1 font-mono text-[10px] font-black text-zinc-400">{currentBeatsPerBar}/4</span>\n                    </div>\n\n                    {currentBpm > 0 ? (\n                      <>\n                        <div className="mt-4 grid grid-cols-3 gap-2">\n                          <div className="rounded-xl border border-white/8 bg-black/25 p-3 text-center">\n                            <p className="text-[9px] font-black uppercase tracking-widest text-zinc-600">Compás</p>\n                            <p className="mt-1 font-mono text-2xl font-black text-white">{musicalPosition.beforeStart ? 'PRE' : musicalPosition.bar}</p>\n                          </div>\n                          <div className="rounded-xl border border-white/8 bg-black/25 p-3 text-center">\n                            <p className="text-[9px] font-black uppercase tracking-widest text-zinc-600">Beat</p>\n                            <p className="mt-1 font-mono text-2xl font-black text-cyan-200">{musicalPosition.beforeStart ? '--' : musicalPosition.beat}<span className="text-xs text-zinc-600">/{currentBeatsPerBar}</span></p>\n                          </div>\n                          <div className="rounded-xl border border-white/8 bg-black/25 p-3 text-center">\n                            <p className="text-[9px] font-black uppercase tracking-widest text-zinc-600">BPM</p>\n                            <p className="mt-1 font-mono text-2xl font-black text-white">{currentBpm}</p>\n                          </div>\n                        </div>\n\n                        <div className="mt-3 flex flex-wrap items-center gap-1.5">\n                          {Array.from({ length: currentBeatsPerBar }, (_, beatIndex) => {\n                            const activeBeat = !musicalPosition.beforeStart && musicalPosition.beat === beatIndex + 1;\n                            return (\n                              <span\n                                key={beatIndex}\n                                className={'h-2.5 flex-1 rounded-full transition-colors ' + (activeBeat ? 'bg-cyan-300' : 'bg-zinc-800')}\n                              />\n                            );\n                          })}\n                        </div>\n                      </>\n                    ) : (\n                      <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] p-3 text-xs font-bold text-amber-200">\n                        Esta canción no tiene BPM configurado. El reloj musical queda desactivado hasta definirlo.\n                      </div>\n                    )}\n                  </div>\n\n                  <div className="rounded-2xl border border-white/10 bg-black/25 p-4">\n                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-400">Alineación</p>\n                    <p className="mt-2 text-[10px] font-semibold leading-relaxed text-zinc-600">Marca el instante exacto donde comienza el compás 1. Por ahora esta referencia vive solo durante esta sesión.</p>\n                    <p className="mt-3 font-mono text-xs font-black text-zinc-300">Inicio: {formatTime(currentGridOffset)}</p>\n                    <div className="mt-3 grid gap-2">\n                      <button\n                        type="button"\n                        onClick={markGridStart}\n                        disabled={!currentBpm || playback.stems.length === 0}\n                        className="rounded-xl bg-cyan-400 px-3 py-2.5 text-[10px] font-black uppercase tracking-wide text-zinc-950 hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-600"\n                      >\n                        Marcar compás 1 aquí\n                      </button>\n                      <button\n                        type="button"\n                        onClick={resetGridStart}\n                        disabled={!currentSongGridKey || currentGridOffset === 0}\n                        className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-[10px] font-black uppercase tracking-wide text-zinc-400 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30"\n                      >\n                        Reiniciar a 0:00\n                      </button>\n                    </div>\n                  </div>\n                </div>\n\n`;
  text = replaceOnce(text, marker, block + marker, 'panel Reloj musical');
}

const required = [
  "from '../../utils/musicalGrid';",
  'const [gridOffsets, setGridOffsets]',
  'const musicalPosition = useMemo',
  'const markGridStart = () =>',
  '>Fase 2A</span>',
  '>Reloj musical</p>',
];

for (const marker of required) {
  if (!text.includes(marker)) throw new Error(`Validación final fallida: ${marker}`);
}

fs.writeFileSync(filePath, text.replace(/\n/g, eol), 'utf8');
console.log('Multitrack Live Fase 2A integrado: reloj musical + alineación de compás 1.');
