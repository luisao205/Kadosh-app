import fs from 'node:fs';

const filePath = 'src/components/live/MultitrackLive.jsx';
const original = fs.readFileSync(filePath, 'utf8');
const eol = original.includes('\r\n') ? '\r\n' : '\n';
let text = original.replace(/\r\n/g, '\n');

const replaceOnce = (source, needle, replacement, label) => {
  const first = source.indexOf(needle);
  if (first === -1) throw new Error(`No se encontró: ${label}`);
  if (source.indexOf(needle, first + needle.length) !== -1) throw new Error(`Marcador duplicado: ${label}`);
  return source.slice(0, first) + replacement + source.slice(first + needle.length);
};

if (!text.includes('const [navigationNotice, setNavigationNotice]')) {
  text = replaceOnce(
    text,
    "  const [liveMapNotice, setLiveMapNotice] = useState('');",
    "  const [liveMapNotice, setLiveMapNotice] = useState('');\n  const [navigationNotice, setNavigationNotice] = useState('');",
    'estado navigationNotice'
  );
}

if (!text.includes("setNavigationNotice('');\n  };\n\n  const seekPlayback")) {
  text = replaceOnce(
    text,
    `  const stopPlayback = () => {\n    engineRef.current.stop();\n    setPlayback(engineRef.current.getState());\n  };`,
    `  const stopPlayback = () => {\n    engineRef.current.stop();\n    setPlayback(engineRef.current.getState());\n    setNavigationNotice('');\n  };`,
    'stopPlayback seguro'
  );
}

if (!text.includes("La canción sigue reproduciéndose. Pulsa Stop o Pausa")) {
  text = replaceOnce(
    text,
    `  const changeSong = (nextIndex) => {\n    if (nextIndex < 0 || nextIndex >= playlist.length || nextIndex === currentIndex) return;\n    engineRef.current.stop();\n    setCurrentIndex(nextIndex);\n  };`,
    `  const changeSong = (nextIndex) => {\n    if (nextIndex < 0 || nextIndex >= playlist.length || nextIndex === currentIndex) return;\n    if (liveRunnerMode && playback.playing) {\n      setNavigationNotice('La canción sigue reproduciéndose. Pulsa Stop o Pausa antes de cambiar de tema.');\n      return;\n    }\n    setNavigationNotice('');\n    engineRef.current.stop();\n    setCurrentIndex(nextIndex);\n  };`,
    'changeSong protegido'
  );
}

if (!text.includes('const next = liveRunnerMode && index === currentIndex + 1;')) {
  text = replaceOnce(
    text,
    `              const active = index === currentIndex;\n              const songReadiness = readinessByKey.get(String(song.setlistItemId));`,
    `              const active = index === currentIndex;\n              const next = liveRunnerMode && index === currentIndex + 1;\n              const songReadiness = readinessByKey.get(String(song.setlistItemId));`,
    'estado next en playlist'
  );
}

if (!text.includes("next ? 'border-cyan-400/25")) {
  text = replaceOnce(
    text,
    `                  className={\`min-w-[230px] rounded-2xl border p-3 text-left transition-all xl:min-w-0 \${active ? 'border-emerald-400/40 bg-emerald-400/10 shadow-[0_0_25px_rgba(16,185,129,.08)]' : 'border-white/8 bg-black/20 hover:border-white/20 hover:bg-white/[0.04]'}\`}\n                >`,
    `                  className={\`min-w-[230px] rounded-2xl border p-3 text-left transition-all xl:min-w-0 \${active ? 'border-emerald-400/40 bg-emerald-400/10 shadow-[0_0_25px_rgba(16,185,129,.08)]' : next ? 'border-cyan-400/25 bg-cyan-400/[0.055] hover:border-cyan-300/40' : 'border-white/8 bg-black/20 hover:border-white/20 hover:bg-white/[0.04]'}\`}\n                >`,
    'estilo actual siguiente'
  );
}

if (!text.includes('>Actual</span>')) {
  text = replaceOnce(
    text,
    `                      <p className={\`truncate text-sm font-black \${active ? 'text-white' : 'text-zinc-300'}\`}>{song.titulo}</p>`,
    `                      <div className="flex items-center gap-2">\n                        <p className={\`min-w-0 flex-1 truncate text-sm font-black \${active ? 'text-white' : 'text-zinc-300'}\`}>{song.titulo}</p>\n                        {liveRunnerMode && active && <span className="shrink-0 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2 py-0.5 text-[8px] font-black uppercase tracking-widest text-emerald-300">Actual</span>}\n                        {next && <span className="shrink-0 rounded-full border border-cyan-400/25 bg-cyan-400/10 px-2 py-0.5 text-[8px] font-black uppercase tracking-widest text-cyan-200">Siguiente</span>}\n                      </div>`,
    'badges actual siguiente'
  );
}

const runnerSummaryMarker = `                <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">`;
if (!text.includes('Ahora en Live')) {
  text = replaceOnce(
    text,
    runnerSummaryMarker,
    `                {liveRunnerMode && (\n                  <div className="mt-5 grid gap-2 sm:grid-cols-2">\n                    <div className="rounded-2xl border border-emerald-400/25 bg-emerald-400/[0.07] p-3">\n                      <p className="text-[9px] font-black uppercase tracking-[0.18em] text-emerald-300">Ahora en Live</p>\n                      <p className="mt-1 truncate text-sm font-black text-white">{currentSong.titulo}</p>\n                    </div>\n                    <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/[0.045] p-3">\n                      <p className="text-[9px] font-black uppercase tracking-[0.18em] text-cyan-300">Siguiente</p>\n                      <p className="mt-1 truncate text-sm font-black text-zinc-200">{playlist[currentIndex + 1]?.titulo || 'Fin del setlist'}</p>\n                    </div>\n                  </div>\n                )}\n\n${runnerSummaryMarker}`,
    'resumen actual siguiente'
  );
}

const livePanelMarker = `                    <div className="mt-4 grid grid-cols-[60px_60px_minmax(120px,1fr)_60px] items-center gap-3">`;
if (!text.includes('navigationNotice &&')) {
  text = replaceOnce(
    text,
    livePanelMarker,
    `                    {navigationNotice && (\n                      <div className="mt-3 flex items-center gap-2 rounded-xl border border-amber-400/25 bg-amber-400/[0.07] px-3 py-2 text-[10px] font-bold text-amber-200">\n                        <AlertTriangle size={14} className="shrink-0" />\n                        {navigationNotice}\n                      </div>\n                    )}\n${livePanelMarker}`,
    'aviso navegación'
  );
}

fs.writeFileSync(filePath, text.replace(/\n/g, eol), 'utf8');
console.log('Multitrack Live Fase 2J integrada: navegación segura y estados Actual/Siguiente.');
