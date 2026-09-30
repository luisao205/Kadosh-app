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

if (!text.includes('>Fase 2C</span>') && !text.includes('>Fase 2D</span>')) {
  throw new Error('Primero debe estar integrada la Fase 2C en MultitrackLive.jsx.');
}

if (!text.includes('const [editingSectionId, setEditingSectionId]')) {
  text = replaceOnce(
    text,
    "  const [sectionError, setSectionError] = useState('');",
    "  const [sectionError, setSectionError] = useState('');\n  const [editingSectionId, setEditingSectionId] = useState(null);\n  const [sectionDraft, setSectionDraft] = useState({ label: '', bar: 1 });",
    'estado editor de secciones'
  );
}

if (!text.includes('const beginEditSection = (section) =>')) {
  const marker = [
    "  const loopSection = async (sectionIndex) => {",
    "    setSectionError('');",
    "    const section = currentSections[sectionIndex];",
    "    const nextSection = currentSections[sectionIndex + 1];",
    "",
    "    if (!section || !nextSection) {",
    "      setSectionError('Para repetir una sección necesitas haber marcado también la sección que viene después.');",
    "      return;",
    "    }",
    "",
    "    try {",
    "      await engineRef.current.seek(section.start);",
    "      const bars = Math.max(1, Math.round((nextSection.start - section.start) / musicalPosition.secondsPerBar));",
    "      const nextState = engineRef.current.setLoopRegion(section.start, nextSection.start, { bars });",
    "      setPlayback(nextState);",
    "    } catch (error) {",
    "      setSectionError(error?.message || 'No se pudo repetir esa sección.');",
    "    }",
    "  };"
  ].join('\n');

  const extra = [
    "",
    "  const beginEditSection = (section) => {",
    "    setSectionError('');",
    "    setEditingSectionId(section.id);",
    "    setSectionDraft({ label: section.label, bar: section.bar });",
    "  };",
    "",
    "  const cancelEditSection = () => {",
    "    setEditingSectionId(null);",
    "    setSectionDraft({ label: '', bar: 1 });",
    "  };",
    "",
    "  const adjustDraftBar = (delta) => {",
    "    setSectionDraft((previous) => ({",
    "      ...previous,",
    "      bar: Math.max(1, (Number(previous.bar) || 1) + delta),",
    "    }));",
    "  };",
    "",
    "  const saveSectionEdit = (sectionId) => {",
    "    setSectionError('');",
    "    const label = String(sectionDraft.label || '').trim();",
    "    const bar = Math.max(1, Math.round(Number(sectionDraft.bar) || 1));",
    "",
    "    if (!label) {",
    "      setSectionError('Escribe un nombre para la sección.');",
    "      return;",
    "    }",
    "",
    "    if (!musicalPosition.secondsPerBar) {",
    "      setSectionError('No se puede recalcular el compás sin un BPM válido.');",
    "      return;",
    "    }",
    "",
    "    const start = currentGridOffset + ((bar - 1) * musicalPosition.secondsPerBar);",
    "    const shortestDuration = Number(playback.shortestStemDuration) || Math.min(...playback.stems.map((stem) => stem.duration));",
    "",
    "    if (start >= shortestDuration - 0.01) {",
    "      setSectionError('Ese compás está fuera del rango seguro de los stems.');",
    "      return;",
    "    }",
    "",
    "    const collides = currentSections.some((section) => section.id !== sectionId && Math.abs(section.start - start) < 0.03);",
    "    if (collides) {",
    "      setSectionError('Ya existe otra sección en ese compás. Elige otro compás.');",
    "      return;",
    "    }",
    "",
    "    if (playback.loop) {",
    "      setPlayback(engineRef.current.cancelLoop());",
    "    }",
    "",
    "    setSectionsBySong((previous) => ({",
    "      ...previous,",
    "      [currentSongGridKey]: (previous[currentSongGridKey] || []).map((section) =>",
    "        section.id === sectionId ? { ...section, label, bar, start } : section",
    "      ).sort((a, b) => a.start - b.start),",
    "    }));",
    "",
    "    cancelEditSection();",
    "  };"
  ].join('\n');

  text = replaceOnce(text, marker, marker + extra, 'acciones editor de secciones');
}

if (text.includes('>Fase 2C</span>')) {
  text = replaceOnce(text, '>Fase 2C</span>', '>Fase 2D</span>', 'etiqueta Fase 2D');
}

const oldHeader = [
  "                          <div className=\"flex items-start justify-between gap-2\">",
  "                            <div className=\"min-w-0\">",
  "                              <p className=\"truncate text-xs font-black text-zinc-100\">{section.label}</p>",
  "                              <p className=\"mt-1 font-mono text-[9px] font-bold text-zinc-600\">Compás {section.bar} · {formatTime(section.start)}</p>",
  "                            </div>",
  "                            <button type=\"button\" onClick={() => removeSectionMarker(section.id)} className=\"rounded-lg border border-white/10 px-2 py-1 text-[10px] font-black text-zinc-600 hover:bg-white/5 hover:text-zinc-300\" title=\"Eliminar sección\">×</button>",
  "                          </div>",
  "                          <div className=\"mt-3 grid grid-cols-2 gap-2\">",
  "                            <button type=\"button\" onClick={() => goToSection(section)} className=\"rounded-lg border border-cyan-400/20 bg-cyan-400/10 px-2 py-2 text-[9px] font-black uppercase tracking-wide text-cyan-200 hover:bg-cyan-400/20\">Ir</button>",
  "                            <button",
  "                              type=\"button\"",
  "                              onClick={() => loopSection(sectionIndex)}",
  "                              disabled={sectionIndex >= currentSections.length - 1}",
  "                              className=\"rounded-lg border border-fuchsia-400/20 bg-fuchsia-400/10 px-2 py-2 text-[9px] font-black uppercase tracking-wide text-fuchsia-200 hover:bg-fuchsia-400/20 disabled:cursor-not-allowed disabled:opacity-30\"",
  "                            >",
  "                              Loop",
  "                            </button>",
  "                          </div>"
].join('\n');

if (!text.includes('Guardar cambios')) {
  const newCard = [
    "                          {editingSectionId === section.id ? (",
    "                            <div className=\"space-y-3\">",
    "                              <div>",
    "                                <label className=\"text-[9px] font-black uppercase tracking-widest text-zinc-600\">Nombre</label>",
    "                                <input",
    "                                  type=\"text\"",
    "                                  value={sectionDraft.label}",
    "                                  onChange={(event) => setSectionDraft((previous) => ({ ...previous, label: event.target.value }))}",
    "                                  className=\"mt-1 w-full rounded-lg border border-white/10 bg-black/35 px-3 py-2 text-xs font-bold text-white outline-none focus:border-violet-400/40\"",
    "                                  placeholder=\"Nombre de sección\"",
    "                                />",
    "                              </div>",
    "                              <div>",
    "                                <label className=\"text-[9px] font-black uppercase tracking-widest text-zinc-600\">Compás de inicio</label>",
    "                                <div className=\"mt-1 grid grid-cols-[38px_minmax(0,1fr)_38px] gap-2\">",
    "                                  <button type=\"button\" onClick={() => adjustDraftBar(-1)} className=\"rounded-lg border border-white/10 bg-white/5 text-lg font-black text-zinc-300 hover:bg-white/10\">−</button>",
    "                                  <input",
    "                                    type=\"number\"",
    "                                    min=\"1\"",
    "                                    step=\"1\"",
    "                                    value={sectionDraft.bar}",
    "                                    onChange={(event) => setSectionDraft((previous) => ({ ...previous, bar: event.target.value }))}",
    "                                    className=\"w-full rounded-lg border border-white/10 bg-black/35 px-3 py-2 text-center font-mono text-xs font-black text-white outline-none focus:border-cyan-400/40\"",
    "                                  />",
    "                                  <button type=\"button\" onClick={() => adjustDraftBar(1)} className=\"rounded-lg border border-white/10 bg-white/5 text-lg font-black text-zinc-300 hover:bg-white/10\">+</button>",
    "                                </div>",
    "                              </div>",
    "                              <div className=\"grid grid-cols-2 gap-2\">",
    "                                <button type=\"button\" onClick={cancelEditSection} className=\"rounded-lg border border-white/10 bg-white/5 px-2 py-2 text-[9px] font-black uppercase tracking-wide text-zinc-400 hover:bg-white/10\">Cancelar</button>",
    "                                <button type=\"button\" onClick={() => saveSectionEdit(section.id)} className=\"rounded-lg bg-emerald-400 px-2 py-2 text-[9px] font-black uppercase tracking-wide text-zinc-950 hover:bg-emerald-300\">Guardar cambios</button>",
    "                              </div>",
    "                            </div>",
    "                          ) : (",
    "                            <>",
    "                              <div className=\"flex items-start justify-between gap-2\">",
    "                                <div className=\"min-w-0\">",
    "                                  <p className=\"truncate text-xs font-black text-zinc-100\">{section.label}</p>",
    "                                  <p className=\"mt-1 font-mono text-[9px] font-bold text-zinc-600\">Compás {section.bar} · {formatTime(section.start)}</p>",
    "                                </div>",
    "                                <div className=\"flex items-center gap-1\">",
    "                                  <button type=\"button\" onClick={() => beginEditSection(section)} className=\"rounded-lg border border-white/10 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-zinc-500 hover:bg-white/5 hover:text-zinc-200\">Editar</button>",
    "                                  <button type=\"button\" onClick={() => removeSectionMarker(section.id)} className=\"rounded-lg border border-white/10 px-2 py-1 text-[10px] font-black text-zinc-600 hover:bg-white/5 hover:text-zinc-300\" title=\"Eliminar sección\">×</button>",
    "                                </div>",
    "                              </div>",
    "                              <div className=\"mt-3 grid grid-cols-2 gap-2\">",
    "                                <button type=\"button\" onClick={() => goToSection(section)} className=\"rounded-lg border border-cyan-400/20 bg-cyan-400/10 px-2 py-2 text-[9px] font-black uppercase tracking-wide text-cyan-200 hover:bg-cyan-400/20\">Ir</button>",
    "                                <button",
    "                                  type=\"button\"",
    "                                  onClick={() => loopSection(sectionIndex)}",
    "                                  disabled={sectionIndex >= currentSections.length - 1}",
    "                                  className=\"rounded-lg border border-fuchsia-400/20 bg-fuchsia-400/10 px-2 py-2 text-[9px] font-black uppercase tracking-wide text-fuchsia-200 hover:bg-fuchsia-400/20 disabled:cursor-not-allowed disabled:opacity-30\"",
    "                                >",
    "                                  Loop",
    "                                </button>",
    "                              </div>",
    "                            </>",
    "                          )}"
  ].join('\n');

  text = replaceOnce(text, oldHeader, newCard, 'editor inline de sección');
}

const required = [
  'const [editingSectionId, setEditingSectionId]',
  'const beginEditSection = (section) =>',
  'const saveSectionEdit = (sectionId) =>',
  '>Fase 2D</span>',
  'Guardar cambios',
  'Compás de inicio',
];

for (const marker of required) {
  if (!text.includes(marker)) throw new Error(`Validación final fallida: ${marker}`);
}

fs.writeFileSync(filePath, text.replace(/\n/g, eol), 'utf8');
console.log('Multitrack Live Fase 2D integrado: edición de nombre y compás de secciones.');
