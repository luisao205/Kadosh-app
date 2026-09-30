import fs from 'node:fs';

const filePath = 'src/components/live/MultitrackLive.jsx';
const original = fs.readFileSync(filePath, 'utf8');
const eol = original.includes('\r\n') ? '\r\n' : '\n';
let text = original.replace(/\r\n/g, '\n');

const replaceOnce = (source, needle, replacement, label) => {
  const first = source.indexOf(needle);
  if (first === -1) throw new Error(`No se encontró el marcador: ${label}`);
  if (source.indexOf(needle, first + needle.length) !== -1) throw new Error(`Marcador duplicado: ${label}`);
  return source.slice(0, first) + replacement + source.slice(first + needle.length);
};

if (!text.includes('>Fase 2B</span>') && !text.includes('>Fase 2C</span>')) {
  throw new Error('Primero debe estar integrada la Fase 2B en MultitrackLive.jsx.');
}

if (!text.includes('const [sectionsBySong, setSectionsBySong]')) {
  text = replaceOnce(
    text,
    "  const [loopError, setLoopError] = useState('');",
    "  const [loopError, setLoopError] = useState('');\n  const [sectionsBySong, setSectionsBySong] = useState({});\n  const [sectionError, setSectionError] = useState('');",
    'estado de secciones'
  );
}

if (!text.includes('const currentSections = useMemo')) {
  text = replaceOnce(
    text,
    "  const musicalPosition = useMemo(() => getMusicalPosition({\n    time: playback.currentTime,\n    bpm: currentBpm,\n    beatsPerBar: currentBeatsPerBar,\n    gridOffsetSeconds: currentGridOffset,\n  }), [playback.currentTime, currentBpm, currentBeatsPerBar, currentGridOffset]);",
    "  const musicalPosition = useMemo(() => getMusicalPosition({\n    time: playback.currentTime,\n    bpm: currentBpm,\n    beatsPerBar: currentBeatsPerBar,\n    gridOffsetSeconds: currentGridOffset,\n  }), [playback.currentTime, currentBpm, currentBeatsPerBar, currentGridOffset]);\n\n  const currentSections = useMemo(() => (\n    Array.isArray(sectionsBySong[currentSongGridKey]) ? sectionsBySong[currentSongGridKey] : []\n  ), [sectionsBySong, currentSongGridKey]);",
    'secciones actuales'
  );
}

if (!text.includes('const addSectionMarker = (baseLabel) =>')) {
  const marker = `  const exitQuantizedLoop = () => {\n    setLoopError('');\n    try {\n      setPlayback(engineRef.current.requestLoopExit());\n    } catch (error) {\n      setLoopError(error?.message || 'No se pudo salir del loop.');\n    }\n  };`;

  const replacement = `${marker}\n\n  const addSectionMarker = (baseLabel) => {\n    setSectionError('');\n\n    if (!currentSongGridKey || !currentBpm || !musicalPosition.valid || musicalPosition.beforeStart || playback.stems.length === 0) {\n      setSectionError('Reproduce la canción y alinea primero el compás 1 antes de marcar secciones.');\n      return;\n    }\n\n    const secondsPerBar = musicalPosition.secondsPerBar;\n    const bar = Math.max(1, musicalPosition.bar);\n    const start = currentGridOffset + ((bar - 1) * secondsPerBar);\n    const sameBaseCount = currentSections.filter((section) => section.baseLabel === baseLabel).length;\n    const label = sameBaseCount > 0 ? baseLabel + ' ' + (sameBaseCount + 1) : baseLabel;\n    const nextMarker = {\n      id: String(Date.now()) + '-' + Math.random().toString(36).slice(2, 8),\n      label,\n      baseLabel,\n      bar,\n      start,\n    };\n\n    setSectionsBySong((previous) => {\n      const current = Array.isArray(previous[currentSongGridKey]) ? previous[currentSongGridKey] : [];\n      const withoutSameBar = current.filter((section) => Math.abs(section.start - start) > 0.03);\n      return {\n        ...previous,\n        [currentSongGridKey]: [...withoutSameBar, nextMarker].sort((a, b) => a.start - b.start),\n      };\n    });\n  };\n\n  const removeSectionMarker = (sectionId) => {\n    setSectionError('');\n    if (!currentSongGridKey) return;\n    setSectionsBySong((previous) => ({\n      ...previous,\n      [currentSongGridKey]: (previous[currentSongGridKey] || []).filter((section) => section.id !== sectionId),\n    }));\n  };\n\n  const goToSection = async (section) => {\n    setSectionError('');\n    try {\n      await engineRef.current.seek(section.start);\n      setPlayback(engineRef.current.getState());\n    } catch (error) {\n      setSectionError(error?.message || 'No se pudo ir a esa sección.');\n    }\n  };\n\n  const loopSection = async (sectionIndex) => {\n    setSectionError('');\n    const section = currentSections[sectionIndex];\n    const nextSection = currentSections[sectionIndex + 1];\n\n    if (!section || !nextSection) {\n      setSectionError('Para repetir una sección necesitas haber marcado también la sección que viene después.');\n      return;\n    }\n\n    try {\n      await engineRef.current.seek(section.start);\n      const bars = Math.max(1, Math.round((nextSection.start - section.start) / musicalPosition.secondsPerBar));\n      const nextState = engineRef.current.setLoopRegion(section.start, nextSection.start, { bars });\n      setPlayback(nextState);\n    } catch (error) {\n      setSectionError(error?.message || 'No se pudo repetir esa sección.');\n    }\n  };`;

  text = replaceOnce(text, marker, replacement, 'acciones de secciones');
}

if (text.includes('>Fase 2B</span>')) {
  text = replaceOnce(text, '>Fase 2B</span>', '>Fase 2C</span>', 'etiqueta Fase 2C');
}

if (!text.includes('>Secciones Live</p>')) {
  const marker = '                <div className="mt-7">';
  const block = `                <div className="mt-3 rounded-2xl border border-violet-400/20 bg-violet-400/[0.045] p-4">\n                  <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">\n                    <div className="min-w-0">\n                      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-300">Secciones Live</p>\n                      <p className="mt-1 text-[10px] font-semibold leading-relaxed text-zinc-500">Hazlo simple: cuando llegues al inicio de una parte, toca su nombre. Kadosh recordará ese punto durante esta sesión.</p>\n                    </div>\n                    <div className="flex flex-wrap gap-2">\n                      {['Intro', 'Verso', 'Pre-coro', 'Coro', 'Puente', 'Instrumental', 'Final'].map((label) => (\n                        <button\n                          key={label}\n                          type="button"\n                          onClick={() => addSectionMarker(label)}\n                          disabled={!currentBpm || playback.stems.length === 0 || musicalPosition.beforeStart}\n                          className="rounded-xl border border-violet-400/20 bg-violet-400/10 px-3 py-2 text-[10px] font-black text-violet-100 hover:bg-violet-400/20 disabled:cursor-not-allowed disabled:opacity-30"\n                        >\n                          + {label}\n                        </button>\n                      ))}\n                    </div>\n                  </div>\n\n                  {currentSections.length > 0 ? (\n                    <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">\n                      {currentSections.map((section, sectionIndex) => (\n                        <div key={section.id} className="rounded-xl border border-white/8 bg-black/25 p-3">\n                          <div className="flex items-start justify-between gap-2">\n                            <div className="min-w-0">\n                              <p className="truncate text-xs font-black text-zinc-100">{section.label}</p>\n                              <p className="mt-1 font-mono text-[9px] font-bold text-zinc-600">Compás {section.bar} · {formatTime(section.start)}</p>\n                            </div>\n                            <button type="button" onClick={() => removeSectionMarker(section.id)} className="rounded-lg border border-white/10 px-2 py-1 text-[10px] font-black text-zinc-600 hover:bg-white/5 hover:text-zinc-300" title="Eliminar sección">×</button>\n                          </div>\n                          <div className="mt-3 grid grid-cols-2 gap-2">\n                            <button type="button" onClick={() => goToSection(section)} className="rounded-lg border border-cyan-400/20 bg-cyan-400/10 px-2 py-2 text-[9px] font-black uppercase tracking-wide text-cyan-200 hover:bg-cyan-400/20">Ir</button>\n                            <button\n                              type="button"\n                              onClick={() => loopSection(sectionIndex)}\n                              disabled={sectionIndex >= currentSections.length - 1}\n                              className="rounded-lg border border-fuchsia-400/20 bg-fuchsia-400/10 px-2 py-2 text-[9px] font-black uppercase tracking-wide text-fuchsia-200 hover:bg-fuchsia-400/20 disabled:cursor-not-allowed disabled:opacity-30"\n                            >\n                              Loop\n                            </button>\n                          </div>\n                        </div>\n                      ))}\n                    </div>\n                  ) : (\n                    <div className="mt-4 rounded-xl border border-dashed border-white/10 p-4 text-center text-[10px] font-semibold text-zinc-600">\n                      Todavía no hay secciones. Reproduce la canción y pulsa “+ Intro”, “+ Verso”, “+ Coro”… justo cuando empiece cada parte.\n                    </div>\n                  )}\n\n                  {sectionError && (\n                    <div className="mt-3 flex gap-2 rounded-xl border border-red-400/20 bg-red-400/[0.07] p-3 text-red-200">\n                      <AlertTriangle size={15} className="mt-0.5 shrink-0" />\n                      <p className="text-[10px] font-bold leading-relaxed">{sectionError}</p>\n                    </div>\n                  )}\n                </div>\n\n`;

  text = replaceOnce(text, marker, block + marker, 'panel Secciones Live');
}

const required = [
  'const [sectionsBySong, setSectionsBySong]',
  'const currentSections = useMemo',
  'const addSectionMarker = (baseLabel) =>',
  'const loopSection = async (sectionIndex) =>',
  '>Fase 2C</span>',
  '>Secciones Live</p>',
];

for (const marker of required) {
  if (!text.includes(marker)) throw new Error(`Validación final fallida: ${marker}`);
}

fs.writeFileSync(filePath, text.replace(/\n/g, eol), 'utf8');
console.log('Multitrack Live Fase 2C integrado: marcadores Intro/Verso/Coro/Puente + salto y loop por sección.');
