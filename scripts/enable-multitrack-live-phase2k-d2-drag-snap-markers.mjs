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
  `  const [waveformPeaks, setWaveformPeaks] = useState([]);`,
  `  const [waveformPeaks, setWaveformPeaks] = useState([]);
  const [timelineDragPreview, setTimelineDragPreview] = useState(null);
  const preparationTimelineRef = useRef(null);
  const preparationTimelineDragRef = useRef(null);`,
  'estado y refs de drag timeline'
);

replaceOnce(
  `    setPlayback(EMPTY_PLAYBACK);
    setWaveformPeaks([]);`,
  `    setPlayback(EMPTY_PLAYBACK);
    setWaveformPeaks([]);
    setTimelineDragPreview(null);
    preparationTimelineDragRef.current = null;`,
  'limpieza drag al cambiar canción'
);

replaceOnce(
  `  const seekPreparationTimeline = async (event) => {
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
  `  const seekPreparationTimeline = async (event) => {
    if (loadingAudio || timelineDuration <= 0 || preparationTimelineDragRef.current) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width) return;
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    setPendingSectionAction(null);
    setNavigationNotice('');
    await engineRef.current.seek(ratio * timelineDuration);
    setPlayback(engineRef.current.getState());
  };

  const getSnappedTimelineSectionPosition = (sectionId, clientX) => {
    const rect = preparationTimelineRef.current?.getBoundingClientRect();
    const secondsPerBar = currentBpm > 0 ? (60 / currentBpm) * currentBeatsPerBar : 0;
    if (!rect?.width || !secondsPerBar || timelineDuration <= 0) return null;

    const sectionIndex = currentSections.findIndex((section) => section.id === sectionId);
    if (sectionIndex < 0) return null;

    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const rawTime = ratio * timelineDuration;
    const rawBar = Math.round((rawTime - currentGridOffset) / secondsPerBar) + 1;
    const lastBar = Math.max(1, Math.floor((timelineDuration - currentGridOffset - 0.01) / secondsPerBar) + 1);
    const previousSection = currentSections[sectionIndex - 1];
    const nextSection = currentSections[sectionIndex + 1];
    const minBar = previousSection ? Math.max(1, Number(previousSection.bar) + 1) : 1;
    const maxBar = nextSection ? Math.min(lastBar, Math.max(1, Number(nextSection.bar) - 1)) : lastBar;
    const safeMin = Math.min(minBar, maxBar);
    const safeMax = Math.max(minBar, maxBar);
    const bar = Math.min(safeMax, Math.max(safeMin, rawBar));
    const start = currentGridOffset + ((bar - 1) * secondsPerBar);

    return {
      sectionId,
      bar,
      start: Math.min(Math.max(0, start), Math.max(0, timelineDuration - 0.01)),
    };
  };

  const commitTimelineSectionPosition = (sectionId, position) => {
    if (!position || !currentSongGridKey) return;
    const section = currentSections.find((item) => item.id === sectionId);
    if (!section) return;

    const collides = currentSections.some((item) => item.id !== sectionId && Number(item.bar) === Number(position.bar));
    if (collides) {
      setSectionError('Ese compás ya pertenece al inicio de otra sección.');
      return;
    }

    if (Number(section.bar) === Number(position.bar)) return;

    if (playback.loop) {
      setPlayback(engineRef.current.cancelLoop());
    }

    setSectionError('');
    setSectionsBySong((previous) => ({
      ...previous,
      [currentSongGridKey]: (previous[currentSongGridKey] || []).map((item) =>
        item.id === sectionId ? { ...item, bar: position.bar, start: position.start } : item
      ).sort((a, b) => a.start - b.start),
    }));
    setLiveMapNotice(section.label + ' movida al compás ' + position.bar + '. Guarda el Live Map para conservar el cambio.');
  };

  const handleTimelineSectionPointerDown = (event, section) => {
    if (!currentBpm || timelineDuration <= 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    preparationTimelineDragRef.current = {
      sectionId: section.id,
      pointerId: event.pointerId,
      originalBar: Number(section.bar),
      moved: false,
    };
    setTimelineDragPreview({ sectionId: section.id, bar: Number(section.bar), start: Number(section.start) || 0 });
  };

  const handleTimelineSectionPointerMove = (event, section) => {
    const drag = preparationTimelineDragRef.current;
    if (!drag || drag.sectionId !== section.id || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const position = getSnappedTimelineSectionPosition(section.id, event.clientX);
    if (!position) return;
    if (position.bar !== drag.originalBar) drag.moved = true;
    setTimelineDragPreview(position);
  };

  const handleTimelineSectionPointerEnd = (event, section, cancelled = false) => {
    const drag = preparationTimelineDragRef.current;
    if (!drag || drag.sectionId !== section.id || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();

    const position = cancelled ? null : getSnappedTimelineSectionPosition(section.id, event.clientX);
    const moved = Boolean(drag.moved && position && position.bar !== drag.originalBar);
    preparationTimelineDragRef.current = null;
    setTimelineDragPreview(null);

    if (cancelled) return;
    if (moved) {
      commitTimelineSectionPosition(section.id, position);
      return;
    }
    void goToSection(section);
  };
`,
  'drag con snap exacto a compás'
);

replaceOnce(
  `                    <div
                      className="relative mt-4 h-44 w-full cursor-crosshair overflow-hidden rounded-2xl border border-white/10 bg-black/35 select-none"
                      onClick={seekPreparationTimeline}
                      title="Toca para mover la reproducción"
                    >`,
  `                    <div
                      ref={preparationTimelineRef}
                      className="relative mt-4 h-44 w-full cursor-crosshair overflow-hidden rounded-2xl border border-white/10 bg-black/35 select-none"
                      onClick={seekPreparationTimeline}
                      title="Toca para mover la reproducción · arrastra una sección para cambiar su compás"
                    >`,
  'ref del timeline visual'
);

replaceOnce(
  `                      {currentSections.map((section, sectionIndex) => {
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
                      })}`,
  `                      {currentSections.map((section, sectionIndex) => {
                        const preview = timelineDragPreview?.sectionId === section.id ? timelineDragPreview : null;
                        const visibleStart = preview ? preview.start : section.start;
                        const visibleBar = preview ? preview.bar : section.bar;
                        const left = timelineDuration > 0 ? (visibleStart / timelineDuration) * 100 : 0;
                        const active = currentLiveSection?.id === section.id;
                        const dragging = Boolean(preview);
                        return (
                          <button
                            key={section.id}
                            type="button"
                            onClick={(event) => event.stopPropagation()}
                            onPointerDown={(event) => handleTimelineSectionPointerDown(event, section)}
                            onPointerMove={(event) => handleTimelineSectionPointerMove(event, section)}
                            onPointerUp={(event) => handleTimelineSectionPointerEnd(event, section)}
                            onPointerCancel={(event) => handleTimelineSectionPointerEnd(event, section, true)}
                            className="absolute inset-y-0 z-10 w-9 -translate-x-1/2 cursor-ew-resize touch-none focus:outline-none"
                            style={{ left: Math.min(100, Math.max(0, left)) + '%' }}
                            title={'Arrastra ' + section.label + ' · compás ' + visibleBar + ' · toque corto para ir'}
                          >
                            <span className={'absolute inset-y-0 left-1/2 w-px -translate-x-1/2 ' + (dragging ? 'bg-sky-200 shadow-[0_0_12px_rgba(186,230,253,.95)]' : active ? 'bg-emerald-300' : 'bg-violet-300/75')} />
                            <span className={'absolute left-1/2 max-w-[118px] -translate-x-1/2 truncate rounded-md border px-1.5 py-1 text-[8px] font-black shadow-lg ' + (dragging ? 'top-2 border-sky-200/60 bg-sky-300/25 text-sky-50' : active ? 'top-2 border-emerald-300/40 bg-emerald-300/20 text-emerald-100' : sectionIndex % 2 === 0 ? 'top-2 border-violet-300/30 bg-violet-400/15 text-violet-100' : 'top-8 border-violet-300/30 bg-violet-400/15 text-violet-100')}>
                              {section.label}{dragging ? ' · C' + visibleBar : ''}
                            </span>
                          </button>
                        );
                      })}`,
  'marcadores arrastrables touch/mouse'
);

replaceOnce(
  `                        <span className="rounded-full border border-white/10 bg-black/20 px-2 py-1 font-mono text-[9px] font-black text-zinc-500">{timelineBars.length} marcas de grid</span>`,
  `                        <span className="rounded-full border border-white/10 bg-black/20 px-2 py-1 font-mono text-[9px] font-black text-zinc-500">{timelineBars.length} marcas de grid</span>
                        <span className="rounded-full border border-violet-400/20 bg-violet-400/10 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-violet-200">Arrastra · snap 1 compás</span>`,
  'ayuda visual snap'
);

replaceOnce(
  `                    <p className="mt-2 text-[9px] font-semibold text-zinc-700">2K-D1: visualización y navegación. En el siguiente paso los marcadores se podrán arrastrar con snap exacto al compás.</p>`,
  `                    <p className="mt-2 text-[9px] font-semibold text-zinc-700">2K-D2: arrastra el marcador de una sección. Su posición se ajusta al compás más cercano y no puede cruzar las secciones vecinas. Toque corto: ir a la sección.</p>`,
  'instrucción D2'
);

const checks = [
  ['timelineDragPreview', 'preview de drag'],
  ['preparationTimelineRef', 'ref timeline'],
  ['getSnappedTimelineSectionPosition', 'cálculo snap'],
  ['commitTimelineSectionPosition', 'persistencia local marcador'],
  ['handleTimelineSectionPointerDown', 'pointer down'],
  ['handleTimelineSectionPointerMove', 'pointer move'],
  ['handleTimelineSectionPointerEnd', 'pointer up'],
  ['touch-none', 'captura touch del marcador'],
  ['Arrastra · snap 1 compás', 'ayuda visual'],
  ['2K-D2:', 'texto D2'],
];

for (const [needle, label] of checks) {
  if (!text.includes(needle)) throw new Error(`Validación final falló: falta ${label}.`);
}

fs.writeFileSync(filePath, text.replace(/\n/g, eol), 'utf8');
console.log(`Multitrack Live Fase 2K-D2 aplicada: marcadores arrastrables con snap a compás y límites seguros (${changes} ajuste(s)).`);
