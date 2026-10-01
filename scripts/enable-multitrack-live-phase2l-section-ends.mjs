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

const replaceAllExact = (needle, replacement, label, minCount = 1) => {
  if (text.includes(replacement) && !text.includes(needle)) {
    console.log(`[skip] ${label}: ya aplicado.`);
    return;
  }
  const count = text.split(needle).length - 1;
  if (count < minCount) throw new Error(`No se encontró suficiente veces: ${label} (${count}/${minCount})`);
  text = text.split(needle).join(replacement);
  changes += count;
  console.log(`[ok] ${label}: ${count} reemplazo(s)`);
};

replaceOnce(
  `  const [sectionDraft, setSectionDraft] = useState({ label: '', bar: 1 });`,
  `  const [sectionDraft, setSectionDraft] = useState({ label: '', bar: 1, endBar: '' });`,
  'draft de sección con compás final'
);

replaceOnce(
  `          bar,\n          start: Number.isFinite(Number(section?.start)) ? Number(section.start) : calculatedStart,`,
  `          bar,\n          endBar: Number.isFinite(Number(section?.endBar)) && Number(section.endBar) > bar\n            ? Math.round(Number(section.endBar))\n            : null,\n          start: Number.isFinite(Number(section?.start)) ? Number(section.start) : calculatedStart,`,
  'carga compatible de endBar'
);

const oldSectionRangeBlock = `  const getSectionIndexAtTime = (time) => {\n    const value = Number(time) || 0;\n    let activeIndex = -1;\n    for (let index = 0; index < currentSections.length; index += 1) {\n      if (value + 0.025 >= currentSections[index].start) activeIndex = index;\n      else break;\n    }\n    return activeIndex;\n  };\n\n  const getSectionEnd = (sectionIndex) => {\n    const nextSection = currentSections[sectionIndex + 1];\n    if (nextSection) return nextSection.start;\n    const safeDuration = Number(playback.shortestStemDuration) || Number(playback.duration) || 0;\n    return safeDuration > 0 ? Math.max(currentSections[sectionIndex]?.start || 0, safeDuration - 0.12) : 0;\n  };\n\n  const currentSectionIndex = getSectionIndexAtTime(playback.currentTime);\n  const currentLiveSection = currentSectionIndex >= 0 ? currentSections[currentSectionIndex] : null;`;

const newSectionRangeBlock = `  const getSafeSongEndBar = () => {\n    const safeDuration = Number(playback.shortestStemDuration) || Number(playback.duration) || 0;\n    const secondsPerBar = currentBpm > 0 ? (60 / currentBpm) * currentBeatsPerBar : 0;\n    if (!safeDuration || !secondsPerBar || safeDuration <= currentGridOffset) return null;\n    return Math.max(2, Math.floor((safeDuration - currentGridOffset - 0.01) / secondsPerBar) + 1);\n  };\n\n  const getSectionEndBar = (sectionIndex) => {\n    const section = currentSections[sectionIndex];\n    if (!section) return null;\n    const nextSection = currentSections[sectionIndex + 1];\n    if (nextSection) return Math.max(Number(section.bar) + 1, Math.round(Number(nextSection.bar) || (Number(section.bar) + 1)));\n\n    const explicitEndBar = Math.round(Number(section.endBar) || 0);\n    const safeEndBar = getSafeSongEndBar();\n    const minimumEndBar = Math.max(2, Math.round(Number(section.bar) || 1) + 1);\n    if (explicitEndBar >= minimumEndBar) {\n      return safeEndBar ? Math.min(explicitEndBar, safeEndBar) : explicitEndBar;\n    }\n    return safeEndBar ? Math.max(minimumEndBar, safeEndBar) : minimumEndBar;\n  };\n\n  const getSectionEnd = (sectionIndex) => {\n    const section = currentSections[sectionIndex];\n    if (!section) return 0;\n    const nextSection = currentSections[sectionIndex + 1];\n    if (nextSection) return Number(nextSection.start) || 0;\n\n    const secondsPerBar = currentBpm > 0 ? (60 / currentBpm) * currentBeatsPerBar : 0;\n    const endBar = getSectionEndBar(sectionIndex);\n    const safeDuration = Number(playback.shortestStemDuration) || Number(playback.duration) || 0;\n    if (secondsPerBar && endBar) {\n      const calculatedEnd = currentGridOffset + ((endBar - 1) * secondsPerBar);\n      if (calculatedEnd > Number(section.start) + 0.02) {\n        return safeDuration > 0 ? Math.min(calculatedEnd, Math.max(Number(section.start), safeDuration - 0.005)) : calculatedEnd;\n      }\n    }\n    return safeDuration > Number(section.start) + 0.02 ? Math.max(Number(section.start), safeDuration - 0.12) : 0;\n  };\n\n  const getSectionIndexAtTime = (time) => {\n    const value = Number(time) || 0;\n    for (let index = 0; index < currentSections.length; index += 1) {\n      const section = currentSections[index];\n      if (value + 0.025 < Number(section.start)) break;\n      const end = getSectionEnd(index);\n      if (value + 0.025 >= Number(section.start) && (!end || value < end - 0.005)) return index;\n    }\n    return -1;\n  };\n\n  const currentSectionIndex = getSectionIndexAtTime(playback.currentTime);\n  const currentLiveSection = currentSectionIndex >= 0 ? currentSections[currentSectionIndex] : null;`;

replaceOnce(oldSectionRangeBlock, newSectionRangeBlock, 'modelo real de inicio/fin de secciones');

replaceOnce(
  `  const activeLoopSectionIndex = playback.loop\n    ? currentSections.findIndex((section, sectionIndex) => {\n      const nextSection = currentSections[sectionIndex + 1];\n      if (!nextSection) return false;\n      return Math.abs(playback.loop.start - section.start) < 0.03\n        && Math.abs(playback.loop.end - nextSection.start) < 0.03;\n    })\n    : -1;`,
  `  const activeLoopSectionIndex = playback.loop\n    ? currentSections.findIndex((section, sectionIndex) => {\n      const sectionEnd = getSectionEnd(sectionIndex);\n      if (!sectionEnd) return false;\n      return Math.abs(playback.loop.start - section.start) < 0.03\n        && Math.abs(playback.loop.end - sectionEnd) < 0.03;\n    })\n    : -1;`,
  'detección de loop usando final real'
);

replaceOnce(
  `  const liveMapDirty = currentLiveMapSignature !== savedLiveMapSignature;`,
  `  const currentLastSectionEndBar = currentSections.length > 0 ? getSectionEndBar(currentSections.length - 1) : null;\n  const savedLastSection = Array.isArray(currentSong?.livePlayback?.sections) && currentSong.livePlayback.sections.length > 0\n    ? currentSong.livePlayback.sections[currentSong.livePlayback.sections.length - 1]\n    : null;\n  const savedLastSectionEndBar = savedLastSection && Number(savedLastSection.endBar) > Number(savedLastSection.bar)\n    ? Math.round(Number(savedLastSection.endBar))\n    : null;\n  const liveMapNeedsSectionEndUpgrade = Boolean(\n    currentSong?.livePlayback\n    && currentSections.length > 0\n    && Number(currentSong.livePlayback.version || 0) < 3\n    && currentLastSectionEndBar\n  );\n  const sectionEndDirty = Boolean(\n    currentSections.length > 0\n    && currentLastSectionEndBar\n    && savedLastSectionEndBar !== currentLastSectionEndBar\n  );\n  const liveMapDirty = currentLiveMapSignature !== savedLiveMapSignature || sectionEndDirty || liveMapNeedsSectionEndUpgrade;`,
  'dirty state compatible con Live Map v3'
);

replaceOnce(
  `    const maxBar = nextSection ? Math.min(lastBar, Math.max(1, Number(nextSection.bar) - 1)) : lastBar;`,
  `    const lastSectionLimit = getSectionEndBar(sectionIndex);\n    const maxBar = nextSection\n      ? Math.min(lastBar, Math.max(1, Number(nextSection.bar) - 1))\n      : Math.min(lastBar, Math.max(1, Number(lastSectionLimit || (lastBar + 1)) - 1));`,
  'drag respeta final real de última sección'
);

replaceOnce(
  `      const withoutSameBar = current.filter((section) => Math.abs(section.start - start) > 0.03);\n      return {\n        ...previous,\n        [currentSongGridKey]: [...withoutSameBar, nextMarker].sort((a, b) => a.start - b.start),\n      };`,
  `      const withoutSameBar = current.filter((section) => Math.abs(section.start - start) > 0.03);\n      const nextSections = [...withoutSameBar, nextMarker].sort((a, b) => a.start - b.start);\n      return {\n        ...previous,\n        [currentSongGridKey]: nextSections.map((section, index) => (\n          index === nextSections.length - 1 ? section : { ...section, endBar: null }\n        )),\n      };`,
  'nueva sección normaliza límite de la última'
);

replaceOnce(
  `    setSectionsBySong((previous) => ({\n      ...previous,\n      [currentSongGridKey]: (previous[currentSongGridKey] || []).filter((section) => section.id !== sectionId),\n    }));`,
  `    setSectionsBySong((previous) => {\n      const nextSections = (previous[currentSongGridKey] || []).filter((section) => section.id !== sectionId);\n      return {\n        ...previous,\n        [currentSongGridKey]: nextSections.map((section, index) => (\n          index === nextSections.length - 1 ? section : { ...section, endBar: null }\n        )),\n      };\n    });`,
  'eliminar sección normaliza límite final'
);

const oldLoopNow = `  const loopSectionNow = async (sectionIndex, message = '') => {\n    const section = currentSections[sectionIndex];\n    const nextSection = currentSections[sectionIndex + 1];\n    if (!section || !nextSection) return;\n\n    try {\n      await engineRef.current.seek(section.start);\n      const bars = Math.max(1, Math.round((nextSection.start - section.start) / musicalPosition.secondsPerBar));\n      const nextState = engineRef.current.setLoopRegion(section.start, nextSection.start, { bars });`;
const newLoopNow = `  const loopSectionNow = async (sectionIndex, message = '') => {\n    const section = currentSections[sectionIndex];\n    const sectionEnd = getSectionEnd(sectionIndex);\n    if (!section || !sectionEnd || sectionEnd <= Number(section.start) + 0.02) return;\n\n    try {\n      await engineRef.current.seek(section.start);\n      const bars = Math.max(1, Math.round((sectionEnd - section.start) / musicalPosition.secondsPerBar));\n      const nextState = engineRef.current.setLoopRegion(section.start, sectionEnd, { bars });`;
replaceOnce(oldLoopNow, newLoopNow, 'loop inmediato usa final real');

replaceOnce(
  `    const section = currentSections[sectionIndex];\n    const nextSection = currentSections[sectionIndex + 1];\n\n    if (!section || !nextSection) {\n      setSectionError('Para repetir una sección necesitas haber marcado también la sección que viene después.');\n      return;\n    }`,
  `    const section = currentSections[sectionIndex];\n    const sectionEnd = getSectionEnd(sectionIndex);\n\n    if (!section || !sectionEnd || sectionEnd <= Number(section.start) + 0.02) {\n      setSectionError('Esta sección no tiene un final musical válido. Revisa su límite en el Editor de Live Map.');\n      return;\n    }`,
  'validación loop permite última sección'
);

replaceOnce(
  `    const sameActiveLoop = playback.loop\n      && Math.abs(playback.loop.start - section.start) < 0.03\n      && Math.abs(playback.loop.end - nextSection.start) < 0.03;`,
  `    const sameActiveLoop = playback.loop\n      && Math.abs(playback.loop.start - section.start) < 0.03\n      && Math.abs(playback.loop.end - sectionEnd) < 0.03;`,
  'loop activo compara final real'
);

replaceOnce(
  `    const activeIndex = getSectionIndexAtTime(playback.currentTime);\n    const bars = Math.max(1, Math.round((nextSection.start - section.start) / musicalPosition.secondsPerBar));`,
  `    const activeIndex = getSectionIndexAtTime(playback.currentTime);\n    const bars = Math.max(1, Math.round((sectionEnd - section.start) / musicalPosition.secondsPerBar));`,
  'duración loop por final real'
);

replaceOnce(
  `        const nextState = engineRef.current.setLoopRegion(section.start, nextSection.start, { bars });`,
  `        const nextState = engineRef.current.setLoopRegion(section.start, sectionEnd, { bars });`,
  'loop armado usa final real'
);

replaceOnce(
  `      end: nextSection.start,`,
  `      end: sectionEnd,`,
  'acción pendiente conserva final real'
);

replaceOnce(
  `  const beginEditSection = (section) => {\n    setSectionError('');\n    setEditingSectionId(section.id);\n    setSectionDraft({ label: section.label, bar: section.bar });\n  };\n\n  const cancelEditSection = () => {\n    setEditingSectionId(null);\n    setSectionDraft({ label: '', bar: 1 });\n  };\n\n  const adjustDraftBar = (delta) => {\n    setSectionDraft((previous) => ({\n      ...previous,\n      bar: Math.max(1, (Number(previous.bar) || 1) + delta),\n    }));\n  };`,
  `  const beginEditSection = (section) => {\n    setSectionError('');\n    const sectionIndex = currentSections.findIndex((item) => item.id === section.id);\n    setEditingSectionId(section.id);\n    setSectionDraft({\n      label: section.label,\n      bar: section.bar,\n      endBar: sectionIndex >= 0 ? (getSectionEndBar(sectionIndex) || '') : '',\n    });\n  };\n\n  const cancelEditSection = () => {\n    setEditingSectionId(null);\n    setSectionDraft({ label: '', bar: 1, endBar: '' });\n  };\n\n  const adjustDraftBar = (delta) => {\n    setSectionDraft((previous) => ({\n      ...previous,\n      bar: Math.max(1, (Number(previous.bar) || 1) + delta),\n    }));\n  };\n\n  const adjustDraftEndBar = (delta) => {\n    setSectionDraft((previous) => ({\n      ...previous,\n      endBar: Math.max((Number(previous.bar) || 1) + 1, (Number(previous.endBar) || ((Number(previous.bar) || 1) + 1)) + delta),\n    }));\n  };`,
  'edición de compás final'
);

replaceOnce(
  `    const label = String(sectionDraft.label || '').trim();\n    const bar = Math.max(1, Math.round(Number(sectionDraft.bar) || 1));`,
  `    const label = String(sectionDraft.label || '').trim();\n    const bar = Math.max(1, Math.round(Number(sectionDraft.bar) || 1));\n    const sectionIndex = currentSections.findIndex((section) => section.id === sectionId);\n    const isLastSection = sectionIndex === currentSections.length - 1;\n    const endBar = isLastSection\n      ? Math.max(bar + 1, Math.round(Number(sectionDraft.endBar) || (bar + 1)))\n      : null;`,
  'lectura de endBar en edición'
);

replaceOnce(
  `    const collides = currentSections.some((section) => section.id !== sectionId && Math.abs(section.start - start) < 0.03);\n    if (collides) {\n      setSectionError('Ya existe otra sección en ese compás. Elige otro compás.');\n      return;\n    }\n\n    if (playback.loop) {`,
  `    const collides = currentSections.some((section) => section.id !== sectionId && Math.abs(section.start - start) < 0.03);\n    if (collides) {\n      setSectionError('Ya existe otra sección en ese compás. Elige otro compás.');\n      return;\n    }\n\n    if (isLastSection) {\n      const safeEndBar = getSafeSongEndBar();\n      if (endBar <= bar) {\n        setSectionError('El compás final debe estar después del inicio de la última sección.');\n        return;\n      }\n      if (safeEndBar && endBar > safeEndBar) {\n        setSectionError('El compás final supera el rango seguro del stem más corto. Máximo: C' + safeEndBar + '.');\n        return;\n      }\n    }\n\n    if (playback.loop) {`,
  'validación del final de última sección'
);

replaceOnce(
  `        section.id === sectionId ? { ...section, label, bar, start } : section`,
  `        section.id === sectionId ? { ...section, label, bar, start, endBar: isLastSection ? endBar : null } : section`,
  'guardar edición con endBar'
);

replaceOnce(
  `    const sections = currentSections.map((section) => ({\n      id: String(section.id),\n      label: String(section.label || '').trim(),\n      baseLabel: String(section.baseLabel || section.label || '').trim(),\n      bar: Math.max(1, Math.round(Number(section.bar) || 1)),\n    })).sort((a, b) => a.bar - b.bar);`,
  `    const sections = currentSections.map((section, sectionIndex) => {\n      const normalized = {\n        id: String(section.id),\n        label: String(section.label || '').trim(),\n        baseLabel: String(section.baseLabel || section.label || '').trim(),\n        bar: Math.max(1, Math.round(Number(section.bar) || 1)),\n      };\n      if (sectionIndex === currentSections.length - 1) {\n        normalized.endBar = getSectionEndBar(sectionIndex);\n      }\n      return normalized;\n    }).sort((a, b) => a.bar - b.bar);`,
  'persistencia de límite final'
);

replaceOnce(
  `      version: 2,`,
  `      version: 3,`,
  'Live Map versión 3'
);

replaceAllExact(
  `disabled={sectionIndex >= currentSections.length - 1}`,
  `disabled={getSectionEnd(sectionIndex) <= Number(section.start) + 0.02}`,
  'Loop habilitado también en última sección',
  3
);

replaceAllExact(
  `Compás {section.bar} · {formatTime(section.start)}`,
  `C{section.bar} → C{getSectionEndBar(sectionIndex) || '--'} · {formatTime(section.start)} → {formatTime(getSectionEnd(sectionIndex))}`,
  'rango real visible en tarjetas',
  3
);

const editStartControl = `                              <div>\n                                <label className="text-[9px] font-black uppercase tracking-widest text-zinc-600">Compás de inicio</label>\n                                <div className="mt-1 grid grid-cols-[38px_minmax(0,1fr)_38px] gap-2">\n                                  <button type="button" onClick={() => adjustDraftBar(-1)} className="rounded-lg border border-white/10 bg-white/5 text-lg font-black text-zinc-300 hover:bg-white/10">−</button>\n                                  <input\n                                    type="number"\n                                    min="1"\n                                    step="1"\n                                    value={sectionDraft.bar}\n                                    onChange={(event) => setSectionDraft((previous) => ({ ...previous, bar: event.target.value }))}\n                                    className="w-full rounded-lg border border-white/10 bg-black/35 px-3 py-2 text-center font-mono text-xs font-black text-white outline-none focus:border-cyan-400/40"\n                                  />\n                                  <button type="button" onClick={() => adjustDraftBar(1)} className="rounded-lg border border-white/10 bg-white/5 text-lg font-black text-zinc-300 hover:bg-white/10">+</button>\n                                </div>\n                              </div>`;

const editStartAndEndControl = `${editStartControl}\n                              {currentSections.findIndex((item) => item.id === section.id) === currentSections.length - 1 && (\n                                <div>\n                                  <div className="flex items-center justify-between gap-2">\n                                    <label className="text-[9px] font-black uppercase tracking-widest text-amber-500">Compás final</label>\n                                    <span className="text-[8px] font-bold text-zinc-600">límite exclusivo · último bloque</span>\n                                  </div>\n                                  <div className="mt-1 grid grid-cols-[38px_minmax(0,1fr)_38px] gap-2">\n                                    <button type="button" onClick={() => adjustDraftEndBar(-1)} className="rounded-lg border border-amber-400/15 bg-amber-400/5 text-lg font-black text-amber-200 hover:bg-amber-400/10">−</button>\n                                    <input\n                                      type="number"\n                                      min={Math.max(2, Number(sectionDraft.bar) + 1)}\n                                      step="1"\n                                      value={sectionDraft.endBar}\n                                      onChange={(event) => setSectionDraft((previous) => ({ ...previous, endBar: event.target.value }))}\n                                      className="w-full rounded-lg border border-amber-400/20 bg-black/35 px-3 py-2 text-center font-mono text-xs font-black text-amber-100 outline-none focus:border-amber-300/50"\n                                    />\n                                    <button type="button" onClick={() => adjustDraftEndBar(1)} className="rounded-lg border border-amber-400/15 bg-amber-400/5 text-lg font-black text-amber-200 hover:bg-amber-400/10">+</button>\n                                  </div>\n                                  <p className="mt-1 text-[8px] font-semibold text-zinc-700">Define dónde termina musicalmente la última sección para permitir Loop y saltos seguros.</p>\n                                </div>\n                              )}`;
replaceOnce(editStartControl, editStartAndEndControl, 'control visual de compás final');

replaceOnce(
  `                      {timelineDuration > 0 && (\n                        <div`,
  `                      {currentSections.length > 0 && getSectionEnd(currentSections.length - 1) > 0 && (\n                        <div\n                          className="pointer-events-none absolute inset-y-0 z-[15] w-px bg-amber-300/80"\n                          style={{ left: Math.min(100, Math.max(0, (getSectionEnd(currentSections.length - 1) / timelineDuration) * 100)) + '%' }}\n                        >\n                          <span className="absolute bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded border border-amber-300/30 bg-amber-400/15 px-1.5 py-0.5 font-mono text-[8px] font-black text-amber-100">FIN · C{getSectionEndBar(currentSections.length - 1)}</span>\n                        </div>\n                      )}\n\n                      {timelineDuration > 0 && (\n                        <div`,
  'marca FIN en timeline'
);

replaceOnce(
  `                    <p className="mt-2 text-[9px] font-semibold text-zinc-700">2K-D3: arrastra el marcador de una sección con snap a compás. Si te equivocas, usa Deshacer/Rehacer antes o después de guardar; cada restauración vuelve a dejar el Live Map como cambio pendiente.</p>`,
  `                    <p className="mt-2 text-[9px] font-semibold text-zinc-700">2L: cada bloque muestra inicio → final. Las secciones intermedias terminan donde empieza la siguiente; la última usa un compás final real y seguro. La marca FIN define su límite de Loop.</p>`,
  'ayuda visual 2L'
);

replaceOnce(
  `                      <p className="mt-1 text-[10px] font-semibold text-zinc-500">Guarda BPM, compás, alineación, secciones y la mezcla completa directamente en la canción.</p>`,
  `                      <p className="mt-1 text-[10px] font-semibold text-zinc-500">Guarda BPM, compás, alineación, secciones con límite final y la mezcla completa directamente en la canción. Live Map v3.</p>`,
  'texto Live Map v3'
);

const checks = [
  ['getSafeSongEndBar', 'cálculo final seguro'],
  ['getSectionEndBar', 'modelo endBar'],
  ['version: 3', 'Live Map v3'],
  ['normalized.endBar = getSectionEndBar', 'persistencia final'],
  ['Compás final', 'editor de final'],
  ['FIN · C', 'marca final timeline'],
  ['sectionEnd', 'loops con final real'],
  ["C{section.bar} → C{getSectionEndBar(sectionIndex) || '--'}", 'rango visible'],
  ['2L:', 'texto de fase 2L'],
];
for (const [needle, label] of checks) {
  if (!text.includes(needle)) throw new Error(`Validación final falló: falta ${label}.`);
}

fs.writeFileSync(filePath, text.replace(/\n/g, eol), 'utf8');
console.log(`Multitrack Live Fase 2L aplicada: finales reales de secciones, Live Map v3 y Loop de última sección (${changes} ajuste(s)).`);
