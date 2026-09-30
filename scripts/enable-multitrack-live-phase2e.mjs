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

if (!text.includes('>Fase 2D</span>') && !text.includes('>Fase 2E</span>')) {
  throw new Error('Primero debe estar integrada la Fase 2D en MultitrackLive.jsx.');
}

if (text.includes("import { doc, getDoc } from 'firebase/firestore';")) {
  text = replaceOnce(
    text,
    "import { doc, getDoc } from 'firebase/firestore';",
    "import { doc, getDoc, updateDoc } from 'firebase/firestore';",
    'import updateDoc'
  );
}

if (!text.includes('const [savingLiveMap, setSavingLiveMap]')) {
  text = replaceOnce(
    text,
    "  const [sectionDraft, setSectionDraft] = useState({ label: '', bar: 1 });",
    "  const [sectionDraft, setSectionDraft] = useState({ label: '', bar: 1 });\n  const [savingLiveMap, setSavingLiveMap] = useState(false);\n  const [liveMapNotice, setLiveMapNotice] = useState('');",
    'estado persistencia Live Map'
  );
}

if (text.includes("  const currentBpm = Number(currentSong?.bpm) || 0;")) {
  text = replaceOnce(
    text,
    "  const currentBpm = Number(currentSong?.bpm) || 0;",
    "  const currentBpm = Number(currentSong?.livePlayback?.bpm ?? currentSong?.bpm) || 0;",
    'BPM desde Live Map'
  );
}

if (!text.includes('currentSong?.livePlayback?.timeSignature?.beats')) {
  text = replaceOnce(
    text,
    "      currentSong?.playbackConfig?.timeSignature?.[0]",
    "      currentSong?.livePlayback?.timeSignature?.beats\n      || currentSong?.livePlayback?.timeSignature?.[0]\n      || currentSong?.playbackConfig?.timeSignature?.[0]",
    'compás desde Live Map'
  );
}

if (!text.includes('const savedLiveMap = currentSong?.livePlayback;')) {
  const marker = "  const currentGridOffset = Number(gridOffsets[currentSongGridKey]) || 0;";
  const hydration = [
    "  useEffect(() => {",
    "    if (!currentSongGridKey || !currentSong) return;",
    "    const savedLiveMap = currentSong?.livePlayback;",
    "    if (!savedLiveMap || typeof savedLiveMap !== 'object') return;",
    "",
    "    const savedOffset = Math.max(0, Number(savedLiveMap.gridOffsetSeconds) || 0);",
    "    const secondsPerBar = currentBpm > 0 ? (60 / currentBpm) * currentBeatsPerBar : 0;",
    "    const savedSections = Array.isArray(savedLiveMap.sections)",
    "      ? savedLiveMap.sections.map((section, index) => {",
    "        const bar = Math.max(1, Math.round(Number(section?.bar) || 1));",
    "        const calculatedStart = secondsPerBar > 0 ? savedOffset + ((bar - 1) * secondsPerBar) : 0;",
    "        return {",
    "          id: String(section?.id || ('saved-' + index + '-' + bar)),",
    "          label: String(section?.label || section?.baseLabel || ('Sección ' + (index + 1))),",
    "          baseLabel: String(section?.baseLabel || section?.label || 'Sección'),",
    "          bar,",
    "          start: Number.isFinite(Number(section?.start)) ? Number(section.start) : calculatedStart,",
    "        };",
    "      }).sort((a, b) => a.start - b.start)",
    "      : [];",
    "",
    "    setGridOffsets((previous) => (",
    "      Object.prototype.hasOwnProperty.call(previous, currentSongGridKey)",
    "        ? previous",
    "        : { ...previous, [currentSongGridKey]: savedOffset }",
    "    ));",
    "    setSectionsBySong((previous) => (",
    "      Object.prototype.hasOwnProperty.call(previous, currentSongGridKey)",
    "        ? previous",
    "        : { ...previous, [currentSongGridKey]: savedSections }",
    "    ));",
    "  }, [currentSong, currentSongGridKey, currentBpm, currentBeatsPerBar]);",
    "",
    marker,
  ].join('\n');
  text = replaceOnce(text, marker, hydration, 'hidratar Live Map guardado');
}

if (!text.includes('const currentLiveMapSignature = useMemo')) {
  const marker = [
    "  const currentSections = useMemo(() => (",
    "    Array.isArray(sectionsBySong[currentSongGridKey]) ? sectionsBySong[currentSongGridKey] : []",
    "  ), [sectionsBySong, currentSongGridKey]);"
  ].join('\n');

  const extra = [
    "",
    "  const currentLiveMapSignature = useMemo(() => JSON.stringify({",
    "    bpm: currentBpm,",
    "    beatsPerBar: currentBeatsPerBar,",
    "    gridOffsetSeconds: Number(currentGridOffset.toFixed(3)),",
    "    sections: currentSections.map((section) => ({",
    "      label: String(section.label || ''),",
    "      baseLabel: String(section.baseLabel || section.label || ''),",
    "      bar: Math.max(1, Math.round(Number(section.bar) || 1)),",
    "    })).sort((a, b) => a.bar - b.bar),",
    "  }), [currentBpm, currentBeatsPerBar, currentGridOffset, currentSections]);",
    "",
    "  const savedLiveMapSignature = useMemo(() => {",
    "    const saved = currentSong?.livePlayback;",
    "    if (!saved || typeof saved !== 'object') return '';",
    "    return JSON.stringify({",
    "      bpm: Number(saved.bpm ?? currentSong?.bpm) || 0,",
    "      beatsPerBar: Math.max(1, Math.min(16, Math.round(Number(saved?.timeSignature?.beats || saved?.timeSignature?.[0] || 4) || 4))),",
    "      gridOffsetSeconds: Number((Math.max(0, Number(saved.gridOffsetSeconds) || 0)).toFixed(3)),",
    "      sections: (Array.isArray(saved.sections) ? saved.sections : []).map((section) => ({",
    "        label: String(section?.label || ''),",
    "        baseLabel: String(section?.baseLabel || section?.label || ''),",
    "        bar: Math.max(1, Math.round(Number(section?.bar) || 1)),",
    "      })).sort((a, b) => a.bar - b.bar),",
    "    });",
    "  }, [currentSong?.livePlayback, currentSong?.bpm]);",
    "",
    "  const liveMapDirty = currentLiveMapSignature !== savedLiveMapSignature;"
  ].join('\n');

  text = replaceOnce(text, marker, marker + extra, 'firma de cambios Live Map');
}

if (!text.includes('const saveLiveMap = async () =>')) {
  const marker = "  const handlePrepareSetlist = async () => {";
  const saveFn = [
    "  const saveLiveMap = async () => {",
    "    setLiveMapNotice('');",
    "    setSectionError('');",
    "",
    "    if (!currentSong?.id) {",
    "      setLiveMapNotice('No hay una canción válida para guardar.');",
    "      return;",
    "    }",
    "    if (!currentBpm) {",
    "      setLiveMapNotice('La canción necesita un BPM válido antes de guardar el Live Map.');",
    "      return;",
    "    }",
    "    if (editingSectionId) {",
    "      setLiveMapNotice('Guarda o cancela la edición de la sección antes de guardar el Live Map.');",
    "      return;",
    "    }",
    "",
    "    const sections = currentSections.map((section) => ({",
    "      id: String(section.id),",
    "      label: String(section.label || '').trim(),",
    "      baseLabel: String(section.baseLabel || section.label || '').trim(),",
    "      bar: Math.max(1, Math.round(Number(section.bar) || 1)),",
    "    })).sort((a, b) => a.bar - b.bar);",
    "",
    "    const livePlayback = {",
    "      version: 1,",
    "      bpm: currentBpm,",
    "      timeSignature: { beats: currentBeatsPerBar, unit: 4 },",
    "      gridOffsetSeconds: Number(currentGridOffset.toFixed(3)),",
    "      sections,",
    "      updatedAt: new Date().toISOString(),",
    "    };",
    "",
    "    const editorId = user?.uid || user?.id || user?.email || '';",
    "    if (editorId) livePlayback.updatedBy = String(editorId);",
    "",
    "    setSavingLiveMap(true);",
    "    try {",
    "      await updateDoc(doc(db, 'canciones', currentSong.id), { livePlayback });",
    "      setSongsById((previous) => ({",
    "        ...previous,",
    "        [currentSong.id]: { ...previous[currentSong.id], livePlayback },",
    "      }));",
    "      setLiveMapNotice('Live Map guardado. Puedes recargar y debe mantenerse.');",
    "    } catch (error) {",
    "      console.error('Error guardando Live Map:', error);",
    "      setLiveMapNotice(error?.message || 'No se pudo guardar el Live Map.');",
    "    } finally {",
    "      setSavingLiveMap(false);",
    "    }",
    "  };",
    "",
    marker,
  ].join('\n');
  text = replaceOnce(text, marker, saveFn, 'guardar Live Map en Firestore');
}

if (text.includes('>Fase 2D</span>')) {
  text = replaceOnce(text, '>Fase 2D</span>', '>Fase 2E</span>', 'etiqueta Fase 2E');
}

if (text.includes('Kadosh recordará ese punto durante esta sesión.')) {
  text = replaceOnce(
    text,
    'Kadosh recordará ese punto durante esta sesión.',
    'Marca y ajusta la estructura. Cuando esté correcta, guarda el Live Map para reutilizarlo en cualquier setlist.',
    'texto persistencia secciones'
  );
}

if (!text.includes('Guardar Live Map')) {
  const marker = '                  {currentSections.length > 0 ? (';
  const block = [
    "                  <div className=\"mt-4 flex flex-col gap-3 rounded-xl border border-emerald-400/15 bg-emerald-400/[0.045] p-3 sm:flex-row sm:items-center sm:justify-between\">",
    "                    <div className=\"min-w-0\">",
    "                      <div className=\"flex flex-wrap items-center gap-2\">",
    "                        <p className=\"text-[10px] font-black uppercase tracking-[0.16em] text-emerald-300\">Live Map de la canción</p>",
    "                        <span className={'rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wide ' + (currentSong?.livePlayback && !liveMapDirty ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200' : 'border-amber-400/25 bg-amber-400/10 text-amber-200')}>",
    "                          {currentSong?.livePlayback && !liveMapDirty ? 'Guardado' : currentSong?.livePlayback ? 'Cambios sin guardar' : 'Sin guardar'}",
    "                        </span>",
    "                      </div>",
    "                      <p className=\"mt-1 text-[10px] font-semibold text-zinc-500\">Guarda BPM, compás, alineación y secciones directamente en la canción.</p>",
    "                      {liveMapNotice && <p className=\"mt-1 text-[10px] font-bold text-zinc-300\">{liveMapNotice}</p>}",
    "                    </div>",
    "                    <button",
    "                      type=\"button\"",
    "                      onClick={saveLiveMap}",
    "                      disabled={savingLiveMap || !currentBpm || Boolean(editingSectionId) || (!liveMapDirty && Boolean(currentSong?.livePlayback))}",
    "                      className=\"flex shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-400 px-4 py-2.5 text-[10px] font-black uppercase tracking-wide text-zinc-950 hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-500\"",
    "                    >",
    "                      {savingLiveMap ? <Loader2 size={14} className=\"animate-spin\" /> : <CheckCircle2 size={14} />}",
    "                      {savingLiveMap ? 'Guardando...' : 'Guardar Live Map'}",
    "                    </button>",
    "                  </div>",
    "",
    marker,
  ].join('\n');
  text = replaceOnce(text, marker, block, 'panel Guardar Live Map');
}

const required = [
  "import { doc, getDoc, updateDoc } from 'firebase/firestore';",
  'const [savingLiveMap, setSavingLiveMap]',
  'const savedLiveMap = currentSong?.livePlayback;',
  'const currentLiveMapSignature = useMemo',
  'const saveLiveMap = async () =>',
  '>Fase 2E</span>',
  'Guardar Live Map',
];

for (const marker of required) {
  if (!text.includes(marker)) throw new Error(`Validación final fallida: ${marker}`);
}

fs.writeFileSync(filePath, text.replace(/\n/g, eol), 'utf8');
console.log('Multitrack Live Fase 2E integrado: Live Map persistente en la canción.');
