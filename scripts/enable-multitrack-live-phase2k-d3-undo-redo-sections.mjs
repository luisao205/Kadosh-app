import fs from 'node:fs';

const filePath = 'src/components/live/MultitrackLive.jsx';
const raw = fs.readFileSync(filePath, 'utf8');
const eol = raw.includes('\r\n') ? '\r\n' : '\n';
let text = raw.replace(/\r\n/g, '\n');
let changes = 0;

const replaceOnce = (needle, replacement, label) => {
  if (text.includes(replacement)) {
    console.log(`[skip] ${label}: ya aplicado.`);
    return;
  }
  const index = text.indexOf(needle);
  if (index === -1) throw new Error(`No se encontró: ${label}`);
  text = text.slice(0, index) + replacement + text.slice(index + needle.length);
  changes += 1;
  console.log(`[ok] ${label}`);
};

replaceOnce(
  `  const [timelineDragPreview, setTimelineDragPreview] = useState(null);\n  const preparationTimelineRef = useRef(null);`,
  `  const [timelineDragPreview, setTimelineDragPreview] = useState(null);\n  const [timelineHistoryPast, setTimelineHistoryPast] = useState([]);\n  const [timelineHistoryFuture, setTimelineHistoryFuture] = useState([]);\n  const preparationTimelineRef = useRef(null);`,
  'estado historial undo/redo'
);

replaceOnce(
  `    setTimelineDragPreview(null);\n    preparationTimelineDragRef.current = null;`,
  `    setTimelineDragPreview(null);\n    setTimelineHistoryPast([]);\n    setTimelineHistoryFuture([]);\n    preparationTimelineDragRef.current = null;`,
  'limpieza historial al cambiar canción'
);

replaceOnce(
  `  const commitTimelineSectionPosition = (sectionId, position) => {`,
  `  const cloneTimelineSections = (sections) => sections.map((item) => ({ ...item }));\n\n  const restoreTimelineSections = (sections, notice) => {\n    if (!currentSongGridKey) return;\n    if (playback.loop) {\n      setPlayback(engineRef.current.cancelLoop());\n    }\n    setTimelineDragPreview(null);\n    preparationTimelineDragRef.current = null;\n    setSectionError('');\n    setSectionsBySong((previous) => ({\n      ...previous,\n      [currentSongGridKey]: cloneTimelineSections(sections).sort((a, b) => a.start - b.start),\n    }));\n    setLiveMapNotice(notice);\n  };\n\n  const pushTimelineHistory = () => {\n    const snapshot = cloneTimelineSections(currentSections);\n    setTimelineHistoryPast((previous) => [...previous.slice(-29), snapshot]);\n    setTimelineHistoryFuture([]);\n  };\n\n  const undoTimelineSectionChange = () => {\n    if (timelineHistoryPast.length === 0) return;\n    const previousSnapshot = timelineHistoryPast[timelineHistoryPast.length - 1];\n    const currentSnapshot = cloneTimelineSections(currentSections);\n    setTimelineHistoryPast((previous) => previous.slice(0, -1));\n    setTimelineHistoryFuture((previous) => [currentSnapshot, ...previous].slice(0, 30));\n    restoreTimelineSections(previousSnapshot, 'Último movimiento de sección deshecho. Guarda el Live Map si quieres conservar este estado.');\n  };\n\n  const redoTimelineSectionChange = () => {\n    if (timelineHistoryFuture.length === 0) return;\n    const nextSnapshot = timelineHistoryFuture[0];\n    const currentSnapshot = cloneTimelineSections(currentSections);\n    setTimelineHistoryFuture((previous) => previous.slice(1));\n    setTimelineHistoryPast((previous) => [...previous.slice(-29), currentSnapshot]);\n    restoreTimelineSections(nextSnapshot, 'Movimiento de sección rehecho. Guarda el Live Map si quieres conservar este estado.');\n  };\n\n  const commitTimelineSectionPosition = (sectionId, position) => {`,
  'funciones undo/redo de secciones'
);

replaceOnce(
  `    setSectionError('');\n    setSectionsBySong((previous) => ({`,
  `    setSectionError('');\n    pushTimelineHistory();\n    setSectionsBySong((previous) => ({`,
  'registro historial antes de mover marcador'
);

replaceOnce(
  `                        <span className="rounded-full border border-violet-400/20 bg-violet-400/10 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-violet-200">Arrastra · snap 1 compás</span>`,
  `                        <span className="rounded-full border border-violet-400/20 bg-violet-400/10 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-violet-200">Arrastra · snap 1 compás</span>\n                        <button\n                          type="button"\n                          onClick={undoTimelineSectionChange}\n                          disabled={timelineHistoryPast.length === 0 || Boolean(timelineDragPreview)}\n                          className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[9px] font-black uppercase tracking-wide text-zinc-300 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-25"\n                          title="Deshacer último movimiento de sección"\n                        >\n                          ↶ <span className="hidden sm:inline">Deshacer</span>\n                        </button>\n                        <button\n                          type="button"\n                          onClick={redoTimelineSectionChange}\n                          disabled={timelineHistoryFuture.length === 0 || Boolean(timelineDragPreview)}\n                          className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[9px] font-black uppercase tracking-wide text-zinc-300 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-25"\n                          title="Rehacer movimiento de sección"\n                        >\n                          ↷ <span className="hidden sm:inline">Rehacer</span>\n                        </button>`,
  'botones deshacer/rehacer timeline'
);

replaceOnce(
  `                    <p className="mt-2 text-[9px] font-semibold text-zinc-700">2K-D2: arrastra el marcador de una sección. Su posición se ajusta al compás más cercano y no puede cruzar las secciones vecinas. Toque corto: ir a la sección.</p>`,
  `                    <p className="mt-2 text-[9px] font-semibold text-zinc-700">2K-D3: arrastra el marcador de una sección con snap a compás. Si te equivocas, usa Deshacer/Rehacer antes o después de guardar; cada restauración vuelve a dejar el Live Map como cambio pendiente.</p>`,
  'instrucción D3'
);

const checks = [
  ['timelineHistoryPast', 'historial hacia atrás'],
  ['timelineHistoryFuture', 'historial hacia adelante'],
  ['pushTimelineHistory', 'registro de historial'],
  ['undoTimelineSectionChange', 'acción deshacer'],
  ['redoTimelineSectionChange', 'acción rehacer'],
  ['↶', 'botón deshacer'],
  ['↷', 'botón rehacer'],
  ['2K-D3:', 'texto D3'],
];

for (const [needle, label] of checks) {
  if (!text.includes(needle)) throw new Error(`Validación final falló: falta ${label}.`);
}

fs.writeFileSync(filePath, text.replace(/\n/g, eol), 'utf8');
console.log(`Multitrack Live Fase 2K-D3 aplicada: deshacer/rehacer movimientos de secciones en timeline (${changes} ajuste(s)).`);
