import fs from 'node:fs';

const componentPath = 'src/components/live/MultitrackLive.jsx';
const preflightPath = 'src/utils/multitrackLivePreflight.js';

const raw = fs.readFileSync(componentPath, 'utf8');
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

const preflightSource = `const getSongAudioCount = (song) => {
  if (Array.isArray(song?.multitracks) && song.multitracks.length > 0) {
    return song.multitracks.filter((track) => track?.url).length;
  }
  return song?.audioUrl ? 1 : 0;
};

const getTimeSignatureBeats = (liveMap) => Number(
  liveMap?.timeSignature?.beats ?? liveMap?.timeSignature?.[0]
);

const getMixerStemCount = (liveMap) => Object.keys(liveMap?.mixer?.stems || {}).length;

export const buildMultitrackSongPreflight = (song, audioReadiness, options = {}) => {
  const issues = [];
  const warnings = [];
  const audioCount = getSongAudioCount(song);
  const cacheSupported = Boolean(options.cacheSupported);
  const liveMap = song?.livePlayback && typeof song.livePlayback === 'object' ? song.livePlayback : null;
  const sections = Array.isArray(liveMap?.sections) ? liveMap.sections : [];
  const checks = {
    audioPresent: audioCount > 0,
    audioLocal: false,
    liveMap: Boolean(liveMap),
    liveMapV3: false,
    bpm: false,
    timeSignature: false,
    grid: false,
    sections: false,
    sectionOrder: false,
    finalBoundary: false,
    mixer: false,
  };

  if (!checks.audioPresent) {
    issues.push('Sin audio asignado para Multitrack Live.');
  } else if (!cacheSupported) {
    issues.push('Este dispositivo no puede verificar ni preparar audio local.');
  } else {
    checks.audioLocal = audioReadiness?.status === 'ready';
    if (!checks.audioLocal) {
      const cached = Math.max(0, Number(audioReadiness?.cached) || 0);
      const total = Math.max(audioCount, Number(audioReadiness?.total) || 0);
      issues.push('Audio local incompleto (' + cached + '/' + total + ').');
    }
  }

  const bpm = Number(liveMap?.bpm ?? song?.bpm) || 0;
  checks.bpm = bpm > 0;
  if (!checks.bpm) issues.push('BPM inválido o ausente.');

  if (!liveMap) {
    issues.push('Sin Live Map guardado.');
  } else {
    const version = Number(liveMap.version) || 0;
    checks.liveMapV3 = version >= 3;
    if (!checks.liveMapV3) warnings.push('Live Map anterior a v3; conviene abrirlo y volver a guardarlo.');

    const beats = getTimeSignatureBeats(liveMap);
    checks.timeSignature = Number.isFinite(beats) && beats >= 1 && beats <= 16;
    if (!checks.timeSignature) issues.push('Compás musical inválido en el Live Map.');

    const gridOffset = Number(liveMap.gridOffsetSeconds);
    checks.grid = Number.isFinite(gridOffset) && gridOffset >= 0;
    if (!checks.grid) issues.push('Alineación del compás 1 no válida.');

    checks.sections = sections.length > 0;
    if (!checks.sections) {
      issues.push('No hay secciones Live guardadas.');
    } else {
      const bars = sections.map((section) => Math.round(Number(section?.bar) || 0));
      checks.sectionOrder = bars.every((bar, index) => (
        bar >= 1 && (index === 0 || bar > bars[index - 1])
      ));
      if (!checks.sectionOrder) issues.push('Hay secciones con compases duplicados o fuera de orden.');

      const lastSection = sections[sections.length - 1];
      const lastBar = Math.round(Number(lastSection?.bar) || 0);
      const lastEndBar = Math.round(Number(lastSection?.endBar) || 0);
      checks.finalBoundary = lastBar >= 1 && lastEndBar > lastBar;
      if (!checks.finalBoundary) issues.push('La última sección no tiene un compás final real guardado.');
    }

    const mixerStemCount = getMixerStemCount(liveMap);
    checks.mixer = mixerStemCount > 0;
    if (!checks.mixer) {
      warnings.push('No hay mezcla guardada en el Live Map.');
    } else if (audioCount > 0 && mixerStemCount !== audioCount) {
      warnings.push('La mezcla guardada tiene ' + mixerStemCount + ' canal(es) para ' + audioCount + ' audio(s).');
    }
  }

  const status = issues.length > 0 ? 'blocked' : warnings.length > 0 ? 'warning' : 'ready';
  return {
    key: String(song?.setlistItemId || song?.id || ''),
    songId: song?.id || null,
    title: String(song?.titulo || 'Canción'),
    status,
    issues,
    warnings,
    checks,
    audioCount,
  };
};

export const summarizeMultitrackPreflight = (items) => {
  const list = Array.isArray(items) ? items : [];
  return {
    total: list.length,
    ready: list.filter((item) => item.status === 'ready').length,
    warning: list.filter((item) => item.status === 'warning').length,
    blocked: list.filter((item) => item.status === 'blocked').length,
    issues: list.reduce((sum, item) => sum + item.issues.length, 0),
    warnings: list.reduce((sum, item) => sum + item.warnings.length, 0),
  };
};
`;

if (!fs.existsSync(preflightPath)) {
  fs.writeFileSync(preflightPath, preflightSource.replace(/\n/g, eol), 'utf8');
  changes += 1;
  console.log('[ok] util de preflight musical');
} else {
  const existing = fs.readFileSync(preflightPath, 'utf8');
  if (!existing.includes('buildMultitrackSongPreflight') || !existing.includes('summarizeMultitrackPreflight')) {
    throw new Error('Ya existe multitrackLivePreflight.js con contenido inesperado.');
  }
  console.log('[skip] util de preflight musical: ya existe.');
}

replaceOnce(
  `import { getMusicalPosition, getNextMusicalBoundary } from '../../utils/musicalGrid';`,
  `import { getMusicalPosition, getNextMusicalBoundary } from '../../utils/musicalGrid';\nimport { buildMultitrackSongPreflight, summarizeMultitrackPreflight } from '../../utils/multitrackLivePreflight';`,
  'import del preflight'
);

replaceOnce(
  `  const readinessByKey = useMemo(() => new Map(\n    (readiness?.songs || []).map((song) => [String(song.key), song])\n  ), [readiness]);`,
  `  const readinessByKey = useMemo(() => new Map(\n    (readiness?.songs || []).map((song) => [String(song.key), song])\n  ), [readiness]);\n\n  const preflightSongs = useMemo(() => playlist.map((song, index) => {\n    const key = String(song?.setlistItemId || song?.id || 'song-' + index);\n    return buildMultitrackSongPreflight(song, readinessByKey.get(key), {\n      cacheSupported: readiness?.supported ?? isMultitrackCacheSupported(),\n    });\n  }), [playlist, readinessByKey, readiness?.supported]);\n\n  const preflightSummary = useMemo(() => summarizeMultitrackPreflight(preflightSongs), [preflightSongs]);\n\n  const currentRuntimePreflight = useMemo(() => {\n    const issues = [];\n    const warnings = [];\n    if (audioError) issues.push('Error de audio: ' + audioError);\n    if (!loadingAudio && getSongAudioCount(currentSong) > 0 && playback.stems.length === 0) {\n      issues.push('El audio de la canción actual no pudo quedar listo en el motor.');\n    }\n    if (stemErrors.length > 0) {\n      issues.push(stemErrors.length + ' stem(s) omitido(s): ' + stemErrors.map((item) => item.name).join(', '));\n    }\n    if (durationSpread > 0.12) {\n      warnings.push('Los stems difieren ' + durationSpread.toFixed(2) + ' s de duración.');\n    }\n    return { issues, warnings, checking: loadingAudio };\n  }, [audioError, loadingAudio, currentSong, playback.stems.length, stemErrors, durationSpread]);`,
  'modelo completo de preflight'
);

const preflightPanel = `      {liveRunnerMode && (\n        <div className="mx-auto w-full min-w-0 max-w-[1800px] px-3 pt-3 md:px-5 md:pt-4">\n          <div className={'rounded-2xl border p-4 ' + (preflightSummary.blocked > 0 ? 'border-red-400/25 bg-red-400/[0.055]' : preflightSummary.warning > 0 ? 'border-amber-400/25 bg-amber-400/[0.055]' : 'border-emerald-400/25 bg-emerald-400/[0.06]')}>\n            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">\n              <div className="min-w-0">\n                <div className="flex flex-wrap items-center gap-2">\n                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-200">Preflight del culto</p>\n                  <span className={'rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wide ' + (preflightSummary.blocked > 0 ? 'border-red-400/30 bg-red-400/10 text-red-200' : preflightSummary.warning > 0 ? 'border-amber-400/30 bg-amber-400/10 text-amber-200' : 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200')}>\n                    {preflightSummary.blocked > 0 ? 'Revisar antes de Live' : preflightSummary.warning > 0 ? 'Listo con avisos' : 'Listo para culto'}\n                  </span>\n                </div>\n                <p className="mt-1 text-[10px] font-semibold text-zinc-500">Audio local, BPM, Live Map v3, grid, secciones, final real y mezcla guardada por canción.</p>\n              </div>\n              <div className="flex flex-wrap items-center gap-2">\n                <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[9px] font-black text-emerald-200">Listas {preflightSummary.ready}</span>\n                {preflightSummary.warning > 0 && <span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-2.5 py-1 text-[9px] font-black text-amber-200">Avisos {preflightSummary.warning}</span>}\n                {preflightSummary.blocked > 0 && <span className="rounded-full border border-red-400/20 bg-red-400/10 px-2.5 py-1 text-[9px] font-black text-red-200">Bloqueos {preflightSummary.blocked}</span>}\n                {cacheSupported && (readiness?.pendingAudio || 0) > 0 && (\n                  <button type="button" onClick={handlePrepareSetlist} disabled={preparingSetlist} className="rounded-xl border border-violet-400/25 bg-violet-400/10 px-3 py-2 text-[9px] font-black uppercase tracking-wide text-violet-100 hover:bg-violet-400/20 disabled:opacity-40">\n                    {preparingSetlist ? 'Preparando…' : 'Preparar audios faltantes'}\n                  </button>\n                )}\n              </div>\n            </div>\n\n            <div className="mt-3 grid max-h-72 gap-2 overflow-y-auto pr-1 md:grid-cols-2 xl:grid-cols-3">\n              {preflightSongs.map((item, index) => {\n                const active = index === currentIndex;\n                const statusLabel = item.status === 'blocked' ? 'BLOQUEO' : item.status === 'warning' ? 'AVISO' : 'LISTA';\n                const coreSectionsReady = item.checks.sections && item.checks.sectionOrder && item.checks.finalBoundary;\n                return (\n                  <div key={item.key || item.songId || index} className={'rounded-xl border p-3 ' + (active ? 'border-cyan-400/35 bg-cyan-400/[0.06]' : item.status === 'blocked' ? 'border-red-400/15 bg-black/20' : 'border-white/8 bg-black/20')}>\n                    <div className="flex items-start justify-between gap-2">\n                      <div className="min-w-0">\n                        <p className="truncate text-xs font-black text-zinc-100">{index + 1}. {item.title}</p>\n                        {active && <p className="mt-0.5 text-[8px] font-black uppercase tracking-widest text-cyan-300">Canción actual</p>}\n                      </div>\n                      <span className={'shrink-0 rounded-full border px-2 py-0.5 text-[8px] font-black ' + (item.status === 'blocked' ? 'border-red-400/25 bg-red-400/10 text-red-200' : item.status === 'warning' ? 'border-amber-400/25 bg-amber-400/10 text-amber-200' : 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200')}>{statusLabel}</span>\n                    </div>\n                    <div className="mt-2 flex flex-wrap gap-1.5">\n                      {[\n                        ['Audio', item.checks.audioLocal],\n                        ['BPM', item.checks.bpm],\n                        ['Mapa', item.checks.liveMap],\n                        ['Secciones', coreSectionsReady],\n                      ].map(([label, ok]) => (\n                        <span key={label} className={'rounded-md border px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wide ' + (ok ? 'border-emerald-400/15 bg-emerald-400/[0.07] text-emerald-300' : 'border-red-400/15 bg-red-400/[0.07] text-red-300')}>{label}</span>\n                      ))}\n                      <span className={'rounded-md border px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wide ' + (item.checks.mixer ? 'border-emerald-400/15 bg-emerald-400/[0.07] text-emerald-300' : 'border-amber-400/15 bg-amber-400/[0.07] text-amber-300')}>Mezcla</span>\n                    </div>\n                    {item.issues.length > 0 && <p className="mt-2 text-[9px] font-bold leading-relaxed text-red-200/85">{item.issues.join(' · ')}</p>}\n                    {item.warnings.length > 0 && <p className="mt-2 text-[9px] font-bold leading-relaxed text-amber-200/75">{item.warnings.join(' · ')}</p>}\n                  </div>\n                );\n              })}\n            </div>\n\n            {currentSong && (\n              <div className={'mt-3 rounded-xl border px-3 py-2.5 ' + (currentRuntimePreflight.issues.length > 0 ? 'border-red-400/20 bg-red-400/[0.06]' : currentRuntimePreflight.warnings.length > 0 ? 'border-amber-400/20 bg-amber-400/[0.06]' : 'border-white/8 bg-black/20')}>\n                <div className="flex flex-wrap items-center justify-between gap-2">\n                  <div>\n                    <p className="text-[9px] font-black uppercase tracking-[0.14em] text-zinc-400">Chequeo del dispositivo · canción actual</p>\n                    <p className="mt-1 text-[9px] font-semibold text-zinc-600">Valida la decodificación real de stems en este equipo, además del preflight guardado.</p>\n                  </div>\n                  <span className={'rounded-full border px-2 py-0.5 text-[8px] font-black uppercase tracking-wide ' + (currentRuntimePreflight.checking ? 'border-blue-400/20 bg-blue-400/10 text-blue-200' : currentRuntimePreflight.issues.length > 0 ? 'border-red-400/20 bg-red-400/10 text-red-200' : currentRuntimePreflight.warnings.length > 0 ? 'border-amber-400/20 bg-amber-400/10 text-amber-200' : 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200')}>\n                    {currentRuntimePreflight.checking ? 'Comprobando' : currentRuntimePreflight.issues.length > 0 ? 'Revisar' : currentRuntimePreflight.warnings.length > 0 ? 'Aviso' : 'Runtime OK'}\n                  </span>\n                </div>\n                {currentRuntimePreflight.issues.length > 0 && <p className="mt-2 text-[9px] font-bold text-red-200">{currentRuntimePreflight.issues.join(' · ')}</p>}\n                {currentRuntimePreflight.warnings.length > 0 && <p className="mt-2 text-[9px] font-bold text-amber-200">{currentRuntimePreflight.warnings.join(' · ')}</p>}\n              </div>\n            )}\n          </div>\n        </div>\n      )}\n\n`;

replaceOnce(
  `      {(preparingSetlist || prepareSummary) && (`,
  preflightPanel + `      {(preparingSetlist || prepareSummary) && (`,
  'panel visual de preflight en Live Runner'
);

const checks = [
  ['buildMultitrackSongPreflight', 'motor de preflight'],
  ['summarizeMultitrackPreflight', 'resumen de preflight'],
  ['preflightSongs', 'preflight por canción'],
  ['currentRuntimePreflight', 'chequeo runtime actual'],
  ['Preflight del culto', 'panel visual'],
  ['Preparar audios faltantes', 'acción de preparación desde Live Runner'],
  ['Chequeo del dispositivo · canción actual', 'runtime visual'],
];

for (const [needle, label] of checks) {
  if (!text.includes(needle)) throw new Error(`Validación final falló: falta ${label}.`);
}

fs.writeFileSync(componentPath, text.replace(/\n/g, eol), 'utf8');
console.log(`Multitrack Live Fase 2M aplicada: preflight integral del culto (${changes} ajuste(s)).`);
