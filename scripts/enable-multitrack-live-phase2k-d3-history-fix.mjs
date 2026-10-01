import fs from 'node:fs';

const filePath = 'src/components/live/MultitrackLive.jsx';
const raw = fs.readFileSync(filePath, 'utf8');
const eol = raw.includes('\r\n') ? '\r\n' : '\n';
let text = raw.replace(/\r\n/g, '\n');
let changes = 0;

const functionStart = text.indexOf('  const commitTimelineSectionPosition = (sectionId, position) => {');
const functionEnd = text.indexOf('\n  const handleTimelineSectionPointerDown =', functionStart);
if (functionStart === -1 || functionEnd === -1) {
  throw new Error('No se encontró commitTimelineSectionPosition de D2/D3.');
}

let commitBlock = text.slice(functionStart, functionEnd);

// Evita doble registro si D3 alcanzó a insertar la llamada indirecta dentro de esta función.
commitBlock = commitBlock.replace(/\n    pushTimelineHistory\(\);/g, '');

const anchor = `    if (Number(section.bar) === Number(position.bar)) return;\n\n    if (playback.loop) {`;
const replacement = `    if (Number(section.bar) === Number(position.bar)) return;\n\n    const historySnapshot = cloneTimelineSections(currentSections);\n    setTimelineHistoryPast((previous) => [...previous.slice(-29), historySnapshot]);\n    setTimelineHistoryFuture([]);\n\n    if (playback.loop) {`;

if (!commitBlock.includes('const historySnapshot = cloneTimelineSections(currentSections);')) {
  if (!commitBlock.includes(anchor)) {
    throw new Error('No se encontró el punto exacto para registrar historial dentro del commit del marcador.');
  }
  commitBlock = commitBlock.replace(anchor, replacement);
  changes += 1;
  console.log('[ok] historial registrado directamente al confirmar movimiento');
} else {
  console.log('[skip] historial directo: ya aplicado.');
}

text = text.slice(0, functionStart) + commitBlock + text.slice(functionEnd);

const undoOld = `                          ↶ <span className="hidden sm:inline">Deshacer</span>`;
const undoNew = `                          ↶ <span className="hidden sm:inline">Deshacer</span>{timelineHistoryPast.length > 0 ? ' ' + timelineHistoryPast.length : ''}`;
if (text.includes(undoOld)) {
  text = text.replace(undoOld, undoNew);
  changes += 1;
  console.log('[ok] contador visible en Deshacer');
} else if (text.includes(undoNew)) {
  console.log('[skip] contador Deshacer: ya aplicado.');
} else {
  throw new Error('No se encontró el botón Deshacer de D3.');
}

const redoOld = `                          ↷ <span className="hidden sm:inline">Rehacer</span>`;
const redoNew = `                          ↷ <span className="hidden sm:inline">Rehacer</span>{timelineHistoryFuture.length > 0 ? ' ' + timelineHistoryFuture.length : ''}`;
if (text.includes(redoOld)) {
  text = text.replace(redoOld, redoNew);
  changes += 1;
  console.log('[ok] contador visible en Rehacer');
} else if (text.includes(redoNew)) {
  console.log('[skip] contador Rehacer: ya aplicado.');
} else {
  throw new Error('No se encontró el botón Rehacer de D3.');
}

const checks = [
  ['const historySnapshot = cloneTimelineSections(currentSections);', 'snapshot directo del historial'],
  ['setTimelineHistoryPast((previous) => [...previous.slice(-29), historySnapshot]);', 'registro del historial'],
  ["timelineHistoryPast.length > 0 ? ' ' + timelineHistoryPast.length : ''", 'contador deshacer'],
  ["timelineHistoryFuture.length > 0 ? ' ' + timelineHistoryFuture.length : ''", 'contador rehacer'],
];

for (const [needle, label] of checks) {
  if (!text.includes(needle)) throw new Error(`Validación final falló: falta ${label}.`);
}

fs.writeFileSync(filePath, text.replace(/\n/g, eol), 'utf8');
console.log(`Multitrack Live Fase 2K-D3 fix aplicada: historial directo y contadores Undo/Redo (${changes} ajuste(s)).`);
