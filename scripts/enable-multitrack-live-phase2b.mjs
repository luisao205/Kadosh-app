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

if (text.includes("import { getMusicalPosition } from '../../utils/musicalGrid';")) {
  text = replaceOnce(
    text,
    "import { getMusicalPosition } from '../../utils/musicalGrid';",
    "import { getMusicalPosition, getNextMusicalBoundary } from '../../utils/musicalGrid';",
    'import getNextMusicalBoundary'
  );
}

if (!text.includes('shortestStemDuration: 0,')) {
  text = replaceOnce(
    text,
    "  duration: 0,\n  masterVolume: 1,",
    "  duration: 0,\n  shortestStemDuration: 0,\n  masterVolume: 1,",
    'EMPTY_PLAYBACK shortestStemDuration'
  );
}

if (!text.includes('loop: null,')) {
  text = replaceOnce(
    text,
    "  stems: [],\n};",
    "  stems: [],\n  loop: null,\n};",
    'EMPTY_PLAYBACK loop'
  );
}

if (!text.includes('const [loopError, setLoopError]')) {
  text = replaceOnce(
    text,
    "  const [gridOffsets, setGridOffsets] = useState({});",
    "  const [gridOffsets, setGridOffsets] = useState({});\n  const [loopError, setLoopError] = useState('');",
    'estado loopError'
  );
}

if (!text.includes("setLoopError('');\n    setStemErrors([]);")) {
  text = replaceOnce(
    text,
    "    setAudioError('');\n    setStemErrors([]);",
    "    setAudioError('');\n    setLoopError('');\n    setStemErrors([]);",
    'reset loopError al cambiar canción'
  );
}

if (!text.includes("  const markGridStart = () => {\n    if (!currentSongGridKey || !currentBpm || playback.stems.length === 0) return;\n    if (playback.loop) {")) {
  const oldMark = `  const markGridStart = () => {\n    if (!currentSongGridKey || !currentBpm || playback.stems.length === 0) return;\n    setGridOffsets((previous) => ({\n      ...previous,\n      [currentSongGridKey]: playback.currentTime,\n    }));\n  };`;
  const nextMark = `  const markGridStart = () => {\n    if (!currentSongGridKey || !currentBpm || playback.stems.length === 0) return;\n    if (playback.loop) {\n      setPlayback(engineRef.current.cancelLoop());\n    }\n    setGridOffsets((previous) => ({\n      ...previous,\n      [currentSongGridKey]: playback.currentTime,\n    }));\n  };`;
  text = replaceOnce(text, oldMark, nextMark, 'cancelar loop al realinear grid');
}

if (!text.includes('const armQuantizedLoop = (bars) =>')) {
  const marker = `  const resetGridStart = () => {\n    if (!currentSongGridKey) return;\n    setGridOffsets((previous) => ({\n      ...previous,\n      [currentSongGridKey]: 0,\n    }));\n  };`;

  const replacement = `  const resetGridStart = () => {\n    if (!currentSongGridKey) return;\n    if (playback.loop) {\n      setPlayback(engineRef.current.cancelLoop());\n    }\n    setGridOffsets((previous) => ({\n      ...previous,\n      [currentSongGridKey]: 0,\n    }));\n  };\n\n  const armQuantizedLoop = (bars) => {\n    setLoopError('');\n\n    if (!currentBpm || !musicalPosition.valid || playback.stems.length === 0) {\n      setLoopError('Configura un BPM válido y carga la canción antes de crear un loop.');\n      return;\n    }\n\n    const secondsPerBar = musicalPosition.secondsPerBar;\n    let start = currentGridOffset;\n\n    if (playback.playing) {\n      start = getNextMusicalBoundary({\n        time: playback.currentTime,\n        bpm: currentBpm,\n        beatsPerBar: currentBeatsPerBar,\n        gridOffsetSeconds: currentGridOffset,\n        boundary: 'bar',\n      });\n    } else if (playback.currentTime >= currentGridOffset && !musicalPosition.beforeStart) {\n      start = currentGridOffset + ((Math.max(1, musicalPosition.bar) - 1) * secondsPerBar);\n    }\n\n    const end = start + (Math.max(1, Number(bars) || 1) * secondsPerBar);\n    const shortestDuration = Number(playback.shortestStemDuration) || Math.min(...playback.stems.map((stem) => stem.duration));\n\n    if (end > shortestDuration - 0.005) {\n      setLoopError('Ese bloque llega más allá del stem más corto. Muévete a un compás anterior o elige menos compases.');\n      return;\n    }\n\n    try {\n      const nextState = engineRef.current.setLoopRegion(start, end, { bars });\n      setPlayback(nextState);\n    } catch (error) {\n      setLoopError(error?.message || 'No se pudo crear el loop.');\n    }\n  };\n\n  const exitQuantizedLoop = () => {\n    setLoopError('');\n    try {\n      setPlayback(engineRef.current.requestLoopExit());\n    } catch (error) {\n      setLoopError(error?.message || 'No se pudo salir del loop.');\n    }\n  };`;

  text = replaceOnce(text, marker, replacement, 'acciones loop cuantizado');
}

if (text.includes('>Fase 2A</span>')) {
  text = replaceOnce(text, '>Fase 2A</span>', '>Fase 2B</span>', 'etiqueta Fase 2B');
}

if (!text.includes('>Loop cuantizado</p>')) {
  const marker = '                <div className="mt-7">';
  const block = `                <div className="mt-3 rounded-2xl border border-fuchsia-400/20 bg-fuchsia-400/[0.045] p-4">\n                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">\n                    <div>\n                      <div className="flex flex-wrap items-center gap-2">\n                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-fuchsia-300">Loop cuantizado</p>\n                        {playback.loop && (\n                          <span className={\`rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-widest \\${playback.loop.phase === 'active' ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200' : playback.loop.phase === 'armed' ? 'border-cyan-400/30 bg-cyan-400/10 text-cyan-200' : 'border-amber-400/30 bg-amber-400/10 text-amber-200'}\`}>\n                            {playback.loop.phase === 'active' ? 'Loop activo' : playback.loop.phase === 'armed' ? 'Armado' : 'Saliendo'}\n                          </span>\n                        )}\n                      </div>\n                      <p className="mt-1 text-[10px] font-semibold text-zinc-500">Mientras reproduce, el bloque se arma desde el próximo compás. Todos los stems usan el mismo rango del motor.</p>\n                    </div>\n\n                    <div className="flex flex-wrap gap-2">\n                      {[1, 2, 4, 8].map((bars) => (\n                        <button\n                          key={bars}\n                          type="button"\n                          onClick={() => armQuantizedLoop(bars)}\n                          disabled={!currentBpm || playback.stems.length === 0 || Boolean(playback.loop)}\n                          className="min-w-[54px] rounded-xl border border-fuchsia-400/20 bg-fuchsia-400/10 px-3 py-2 text-[10px] font-black text-fuchsia-100 hover:bg-fuchsia-400/20 disabled:cursor-not-allowed disabled:opacity-30"\n                        >\n                          {bars} {bars === 1 ? 'compás' : 'compases'}\n                        </button>\n                      ))}\n                    </div>\n                  </div>\n\n                  {playback.loop && (\n                    <div className="mt-4 flex flex-col gap-3 rounded-xl border border-white/8 bg-black/25 p-3 sm:flex-row sm:items-center sm:justify-between">\n                      <div>\n                        <p className="text-xs font-black text-zinc-200">{playback.loop.bars} {playback.loop.bars === 1 ? 'compás' : 'compases'} · {formatTime(playback.loop.start)} → {formatTime(playback.loop.end)}</p>\n                        <p className="mt-1 text-[10px] font-semibold text-zinc-600">{playback.loop.phase === 'armed' ? 'Entrará al loop cuando llegue al próximo compás.' : playback.loop.phase === 'exiting' ? 'La salida está cuantizada para no cortar el bloque a la mitad.' : 'El bloque se repetirá hasta que ordenes salir.'}</p>\n                      </div>\n                      <button\n                        type="button"\n                        onClick={exitQuantizedLoop}\n                        disabled={playback.loop.phase === 'exiting'}\n                        className="rounded-xl border border-amber-400/25 bg-amber-400/10 px-4 py-2.5 text-[10px] font-black uppercase tracking-wide text-amber-100 hover:bg-amber-400/20 disabled:cursor-not-allowed disabled:opacity-50"\n                      >\n                        {playback.loop.phase === 'armed' ? 'Cancelar loop' : playback.loop.phase === 'exiting' ? 'Salida programada' : 'Salir del loop'}\n                      </button>\n                    </div>\n                  )}\n\n                  {loopError && (\n                    <div className="mt-3 flex gap-2 rounded-xl border border-red-400/20 bg-red-400/[0.07] p-3 text-red-200">\n                      <AlertTriangle size={15} className="mt-0.5 shrink-0" />\n                      <p className="text-[10px] font-bold leading-relaxed">{loopError}</p>\n                    </div>\n                  )}\n\n                  <p className="mt-3 text-[9px] font-semibold text-zinc-700">Mover la línea de tiempo o pulsar Stop cancela el loop por seguridad.</p>\n                </div>\n\n`;
  text = replaceOnce(text, marker, block + marker, 'panel Loop cuantizado');
}

const required = [
  'getNextMusicalBoundary',
  'shortestStemDuration: 0,',
  'loop: null,',
  'const [loopError, setLoopError]',
  'const armQuantizedLoop = (bars) =>',
  'const exitQuantizedLoop = () =>',
  '>Fase 2B</span>',
  '>Loop cuantizado</p>',
];

for (const marker of required) {
  if (!text.includes(marker)) throw new Error(`Validación final fallida: ${marker}`);
}

fs.writeFileSync(filePath, text.replace(/\n/g, eol), 'utf8');
console.log('Multitrack Live Fase 2B integrado: loops cuantizados de 1, 2, 4 y 8 compases.');
