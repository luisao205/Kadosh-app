import fs from 'node:fs';

const filePath = 'src/components/live/MultitrackLive.jsx';
const original = fs.readFileSync(filePath, 'utf8');
const eol = original.includes('\r\n') ? '\r\n' : '\n';
let text = original.replace(/\r\n/g, '\n');
let changes = 0;

const replaceOnce = (needle, replacement, label) => {
  if (text.includes(replacement)) {
    console.log(`[skip] ${label}: ya aplicado.`);
    return false;
  }
  const first = text.indexOf(needle);
  if (first === -1) throw new Error(`No se encontró: ${label}`);
  text = text.slice(0, first) + replacement + text.slice(first + needle.length);
  changes += 1;
  console.log(`[ok] ${label}`);
  return true;
};

replaceOnce(
  "  const [liveTouchPanel, setLiveTouchPanel] = useState('sections');",
  `  const [liveTouchPanel, setLiveTouchPanel] = useState('sections');
  const [pendingSectionAction, setPendingSectionAction] = useState(null);
  const sectionTapRef = useRef({ id: '', at: 0 });
  const loopTapRef = useRef({ id: '', at: 0 });
  const pendingActionRunningRef = useRef(false);`,
  'estado de navegación segura'
);

replaceOnce(
  `  const currentSections = useMemo(() => (
    Array.isArray(sectionsBySong[currentSongGridKey]) ? sectionsBySong[currentSongGridKey] : []
  ), [sectionsBySong, currentSongGridKey]);`,
  `  const currentSections = useMemo(() => (
    Array.isArray(sectionsBySong[currentSongGridKey]) ? sectionsBySong[currentSongGridKey] : []
  ), [sectionsBySong, currentSongGridKey]);

  const getSectionIndexAtTime = (time) => {
    const value = Number(time) || 0;
    let activeIndex = -1;
    for (let index = 0; index < currentSections.length; index += 1) {
      if (value + 0.025 >= currentSections[index].start) activeIndex = index;
      else break;
    }
    return activeIndex;
  };

  const getSectionEnd = (sectionIndex) => {
    const nextSection = currentSections[sectionIndex + 1];
    if (nextSection) return nextSection.start;
    const safeDuration = Number(playback.shortestStemDuration) || Number(playback.duration) || 0;
    return safeDuration > 0 ? Math.max(currentSections[sectionIndex]?.start || 0, safeDuration - 0.12) : 0;
  };

  const currentSectionIndex = getSectionIndexAtTime(playback.currentTime);
  const currentLiveSection = currentSectionIndex >= 0 ? currentSections[currentSectionIndex] : null;`,
  'detección de sección actual'
);

replaceOnce(
  `  const stopPlayback = () => {
    engineRef.current.stop();
    setPlayback(engineRef.current.getState());
    setNavigationNotice('');
  };

  const seekPlayback = async (event) => {
    await engineRef.current.seek(Number(event.target.value));
    setPlayback(engineRef.current.getState());
  };

  const changeSong = (nextIndex) => {
    if (nextIndex < 0 || nextIndex >= playlist.length || nextIndex === currentIndex) return;
    if (liveRunnerMode && playback.playing) {
      setNavigationNotice('La canción sigue reproduciéndose. Pulsa Stop o Pausa antes de cambiar de tema.');
      return;
    }
    setNavigationNotice('');
    engineRef.current.stop();
    setCurrentIndex(nextIndex);
  };`,
  `  const stopPlayback = () => {
    setPendingSectionAction(null);
    engineRef.current.stop();
    setPlayback(engineRef.current.getState());
    setNavigationNotice('');
  };

  const seekPlayback = async (event) => {
    setPendingSectionAction(null);
    setNavigationNotice('');
    await engineRef.current.seek(Number(event.target.value));
    setPlayback(engineRef.current.getState());
  };

  const changeSong = (nextIndex) => {
    if (nextIndex < 0 || nextIndex >= playlist.length || nextIndex === currentIndex) return;
    if (liveRunnerMode && playback.playing) {
      setNavigationNotice('La canción sigue reproduciéndose. Pulsa Stop o Pausa antes de cambiar de tema.');
      return;
    }
    setPendingSectionAction(null);
    setNavigationNotice('');
    engineRef.current.stop();
    setCurrentIndex(nextIndex);
  };`,
  'cancelación segura al Stop/seek/cambio de canción'
);

const oldSectionFunctions = `  const goToSection = async (section) => {
    setSectionError('');
    try {
      await engineRef.current.seek(section.start);
      setPlayback(engineRef.current.getState());
    } catch (error) {
      setSectionError(error?.message || 'No se pudo ir a esa sección.');
    }
  };

  const loopSection = async (sectionIndex) => {
    setSectionError('');
    const section = currentSections[sectionIndex];
    const nextSection = currentSections[sectionIndex + 1];

    if (!section || !nextSection) {
      setSectionError('Para repetir una sección necesitas haber marcado también la sección que viene después.');
      return;
    }

    try {
      await engineRef.current.seek(section.start);
      const bars = Math.max(1, Math.round((nextSection.start - section.start) / musicalPosition.secondsPerBar));
      const nextState = engineRef.current.setLoopRegion(section.start, nextSection.start, { bars });
      setPlayback(nextState);
    } catch (error) {
      setSectionError(error?.message || 'No se pudo repetir esa sección.');
    }
  };`;

const newSectionFunctions = `  const goToSectionNow = async (section, message = '') => {
    setSectionError('');
    setPendingSectionAction(null);
    try {
      await engineRef.current.seek(section.start);
      setPlayback(engineRef.current.getState());
      if (message) setNavigationNotice(message);
    } catch (error) {
      setSectionError(error?.message || 'No se pudo ir a esa sección.');
    }
  };

  const goToSection = async (section) => {
    setSectionError('');
    if (!section) return;

    const now = Date.now();
    const previousTap = sectionTapRef.current;
    const doubleTap = liveRunnerMode
      && playback.playing
      && previousTap.id === section.id
      && now - previousTap.at <= 430;
    sectionTapRef.current = { id: section.id, at: now };

    if (!liveRunnerMode || !playback.playing || doubleTap) {
      await goToSectionNow(
        section,
        doubleTap ? ('Salto inmediato → ' + section.label) : ''
      );
      return;
    }

    if (pendingSectionAction?.type === 'jump' && pendingSectionAction.sectionId === section.id) {
      setPendingSectionAction(null);
      setNavigationNotice('Salto programado cancelado.');
      return;
    }

    const activeIndex = getSectionIndexAtTime(playback.currentTime);
    if (activeIndex < 0) {
      await goToSectionNow(section, 'Salto inmediato → ' + section.label);
      return;
    }

    let executeAt = getSectionEnd(activeIndex);
    if (playback.loop) {
      executeAt = playback.loop.end;
      setPlayback(engineRef.current.requestLoopExit());
    }

    if (!executeAt || executeAt <= playback.currentTime + 0.02) {
      await goToSectionNow(section, 'Salto inmediato → ' + section.label);
      return;
    }

    setPendingSectionAction({
      type: 'jump',
      sectionId: section.id,
      label: section.label,
      start: section.start,
      executeAt,
    });
    setNavigationNotice('Programado → ' + section.label + '. Esperará al final de ' + (currentSections[activeIndex]?.label || 'la sección actual') + '. Doble toque para ir ahora.');
  };

  const loopSectionNow = async (sectionIndex, message = '') => {
    const section = currentSections[sectionIndex];
    const nextSection = currentSections[sectionIndex + 1];
    if (!section || !nextSection) return;

    try {
      await engineRef.current.seek(section.start);
      const bars = Math.max(1, Math.round((nextSection.start - section.start) / musicalPosition.secondsPerBar));
      const nextState = engineRef.current.setLoopRegion(section.start, nextSection.start, { bars });
      setPendingSectionAction(null);
      setPlayback(nextState);
      if (message) setNavigationNotice(message);
    } catch (error) {
      setSectionError(error?.message || 'No se pudo repetir esa sección.');
    }
  };

  const loopSection = async (sectionIndex) => {
    setSectionError('');
    const section = currentSections[sectionIndex];
    const nextSection = currentSections[sectionIndex + 1];

    if (!section || !nextSection) {
      setSectionError('Para repetir una sección necesitas haber marcado también la sección que viene después.');
      return;
    }

    const now = Date.now();
    const previousTap = loopTapRef.current;
    const doubleTap = liveRunnerMode
      && playback.playing
      && previousTap.id === section.id
      && now - previousTap.at <= 430;
    loopTapRef.current = { id: section.id, at: now };

    if (!liveRunnerMode || !playback.playing || doubleTap) {
      await loopSectionNow(
        sectionIndex,
        doubleTap ? ('Loop inmediato → ' + section.label) : ''
      );
      return;
    }

    const sameActiveLoop = playback.loop
      && Math.abs(playback.loop.start - section.start) < 0.03
      && Math.abs(playback.loop.end - nextSection.start) < 0.03;
    if (sameActiveLoop) {
      setPlayback(engineRef.current.requestLoopExit());
      setNavigationNotice('Salida del loop programada al final de ' + section.label + '.');
      return;
    }

    if (pendingSectionAction?.type === 'loop' && pendingSectionAction.sectionId === section.id) {
      setPendingSectionAction(null);
      setNavigationNotice('Loop programado cancelado.');
      return;
    }

    const activeIndex = getSectionIndexAtTime(playback.currentTime);
    const bars = Math.max(1, Math.round((nextSection.start - section.start) / musicalPosition.secondsPerBar));

    if (activeIndex === sectionIndex) {
      try {
        const nextState = engineRef.current.setLoopRegion(section.start, nextSection.start, { bars });
        setPendingSectionAction(null);
        setPlayback(nextState);
        setNavigationNotice('Loop armado en ' + section.label + ': continuará hasta el final y luego repetirá desde el inicio.');
      } catch (error) {
        setSectionError(error?.message || 'No se pudo repetir esa sección.');
      }
      return;
    }

    if (activeIndex < 0) {
      await loopSectionNow(sectionIndex, 'Loop inmediato → ' + section.label);
      return;
    }

    let executeAt = getSectionEnd(activeIndex);
    if (playback.loop) {
      executeAt = playback.loop.end;
      setPlayback(engineRef.current.requestLoopExit());
    }

    setPendingSectionAction({
      type: 'loop',
      sectionId: section.id,
      sectionIndex,
      label: section.label,
      start: section.start,
      end: nextSection.start,
      bars,
      executeAt,
    });
    setNavigationNotice('Loop programado → ' + section.label + '. Esperará al final de ' + (currentSections[activeIndex]?.label || 'la sección actual') + '. Doble toque para ir ahora.');
  };

  useEffect(() => {
    const action = pendingSectionAction;
    if (!action || !playback.playing || pendingActionRunningRef.current) return;
    if (playback.currentTime < action.executeAt - 0.02) return;

    pendingActionRunningRef.current = true;
    setPendingSectionAction(null);

    const execute = async () => {
      try {
        await engineRef.current.seek(action.start);
        if (action.type === 'loop') {
          const nextState = engineRef.current.setLoopRegion(action.start, action.end, { bars: action.bars });
          setPlayback(nextState);
          setNavigationNotice('Loop activo → ' + action.label);
        } else {
          setPlayback(engineRef.current.getState());
          setNavigationNotice('Ahora → ' + action.label);
        }
      } catch (error) {
        setSectionError(error?.message || 'No se pudo ejecutar la navegación programada.');
      } finally {
        pendingActionRunningRef.current = false;
      }
    };

    execute();
  }, [playback.currentTime, playback.playing, pendingSectionAction]);`;

replaceOnce(oldSectionFunctions, newSectionFunctions, 'saltos y loops seguros');

// Indicador visible en el panel táctil de Secciones.
const sectionPanelHeader = `                          {currentSections.length > 0 ? (`;
if (!text.includes('Acción programada')) {
  const index = text.indexOf(sectionPanelHeader);
  if (index === -1) throw new Error('No se encontró el panel táctil de Secciones para mostrar la acción programada.');
  const indicator = `                          {pendingSectionAction && (
                            <div className={'mt-3 flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-[9px] font-black ' + (pendingSectionAction.type === 'loop' ? 'border-fuchsia-400/25 bg-fuchsia-400/10 text-fuchsia-100' : 'border-cyan-400/25 bg-cyan-400/10 text-cyan-100')}>
                              <span className="min-w-0 truncate">Acción programada · {pendingSectionAction.type === 'loop' ? 'LOOP' : 'IR'} → {pendingSectionAction.label}</span>
                              <span className="shrink-0 font-mono text-zinc-500">al final</span>
                            </div>
                          )}
`;
  text = text.slice(0, index) + indicator + text.slice(index);
  changes += 1;
  console.log('[ok] indicador de acción programada');
}

// Resalta la sección actual y la sección programada en el panel touch.
replaceOnce(
  '<button type="button" onClick={() => goToSection(section)} className="min-h-16 rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-3 text-left active:scale-[0.99]">',
  `<button type="button" onClick={() => goToSection(section)} className={'min-h-16 rounded-xl border px-3 text-left active:scale-[0.99] ' + (pendingSectionAction?.type === 'jump' && pendingSectionAction.sectionId === section.id ? 'border-cyan-300/50 bg-cyan-300/20' : currentLiveSection?.id === section.id ? 'border-emerald-400/45 bg-emerald-400/15' : 'border-cyan-400/20 bg-cyan-400/10')}>`,
  'estado visual sección touch'
);

replaceOnce(
  'className="min-h-16 rounded-xl border border-fuchsia-400/20 bg-fuchsia-400/10 text-[9px] font-black uppercase tracking-wide text-fuchsia-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-25">Loop</button>',
  `className={'min-h-16 rounded-xl border text-[9px] font-black uppercase tracking-wide active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-25 ' + (pendingSectionAction?.type === 'loop' && pendingSectionAction.sectionId === section.id ? 'border-fuchsia-300/55 bg-fuchsia-300/25 text-fuchsia-50' : 'border-fuchsia-400/20 bg-fuchsia-400/10 text-fuchsia-200')}>Loop</button>`,
  'estado visual loop touch'
);

const requiredChecks = [
  ['pendingSectionAction', 'estado de acción programada'],
  ['getSectionIndexAtTime', 'detección de sección actual'],
  ['Loop armado en ', 'loop actual sin corte'],
  ['Doble toque para ir ahora', 'doble toque inmediato'],
  ['Acción programada', 'indicador visual'],
  ['engineRef.current.requestLoopExit()', 'salida segura de loop activo']
];

for (const [needle, label] of requiredChecks) {
  if (!text.includes(needle)) throw new Error(`Validación final falló: falta ${label}.`);
}

fs.writeFileSync(filePath, text.replace(/\n/g, eol), 'utf8');
console.log(`Multitrack Live Fase 2K-C aplicada: saltos y loops esperan al final de la sección; doble toque fuerza acción inmediata (${changes} ajuste(s)).`);
