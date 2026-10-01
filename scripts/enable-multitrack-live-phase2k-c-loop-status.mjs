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
  '  const currentLiveSection = currentSectionIndex >= 0 ? currentSections[currentSectionIndex] : null;',
  `  const currentLiveSection = currentSectionIndex >= 0 ? currentSections[currentSectionIndex] : null;\n  const activeLoopSectionIndex = playback.loop\n    ? currentSections.findIndex((section, sectionIndex) => {\n      const nextSection = currentSections[sectionIndex + 1];\n      if (!nextSection) return false;\n      return Math.abs(playback.loop.start - section.start) < 0.03\n        && Math.abs(playback.loop.end - nextSection.start) < 0.03;\n    })\n    : -1;\n  const activeLoopSection = activeLoopSectionIndex >= 0 ? currentSections[activeLoopSectionIndex] : null;`,
  'detección de sección del loop activo'
);

const actionIndicator = `                          {pendingSectionAction && (\n                            <div className={'mt-3 flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-[9px] font-black ' + (pendingSectionAction.type === 'loop' ? 'border-fuchsia-400/25 bg-fuchsia-400/10 text-fuchsia-100' : 'border-cyan-400/25 bg-cyan-400/10 text-cyan-100')}>`;

if (!text.includes('Estado del loop')) {
  const index = text.indexOf(actionIndicator);
  if (index === -1) throw new Error('No se encontró el indicador de Acción programada para insertar Estado del loop.');
  const loopIndicator = `                          <div className={'mt-3 flex min-w-0 items-center justify-between gap-2 rounded-xl border px-3 py-2 text-[9px] font-black ' + (playback.loop ? (playback.loop.phase === 'exiting' ? 'border-amber-400/30 bg-amber-400/10 text-amber-100' : 'border-fuchsia-400/30 bg-fuchsia-400/10 text-fuchsia-100') : 'border-white/10 bg-black/20 text-zinc-500')}>\n                            <span className=\"min-w-0 truncate\">Estado del loop · {playback.loop ? (playback.loop.phase === 'exiting' ? 'SALIENDO' : 'ACTIVO') : 'DESACTIVADO'}{activeLoopSection ? ' · ' + activeLoopSection.label : ''}</span>\n                            <span className=\"shrink-0 font-mono text-[8px] text-zinc-600\">{playback.loop ? (playback.loop.phase === 'exiting' ? 'fin de vuelta' : formatTime(playback.loop.start) + ' → ' + formatTime(playback.loop.end)) : 'OFF'}</span>\n                          </div>\n`;
  text = text.slice(0, index) + loopIndicator + text.slice(index);
  changes += 1;
  console.log('[ok] indicador persistente Estado del loop');
} else {
  console.log('[skip] indicador persistente Estado del loop: ya aplicado.');
}

const checks = [
  ['activeLoopSectionIndex', 'detección de sección del loop'],
  ['Estado del loop', 'indicador de estado del loop'],
  ['pendingSectionAction', 'acción programada existente'],
];
for (const [needle, label] of checks) {
  if (!text.includes(needle)) throw new Error(`Validación final falló: falta ${label}.`);
}

fs.writeFileSync(filePath, text.replace(/\n/g, eol), 'utf8');
console.log(`Multitrack Live Fase 2K-C estado de loop visible aplicado (${changes} ajuste(s)).`);
