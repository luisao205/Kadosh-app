import fs from 'node:fs';

const filePath = 'src/components/live/MultitrackLive.jsx';
const raw = fs.readFileSync(filePath, 'utf8');
const eol = raw.includes('\r\n') ? '\r\n' : '\n';
let text = raw.replace(/\r\n/g, '\n');
let changes = 0;

const restoreStart = text.indexOf('  const restoreTimelineSections = (sections, notice) => {');
const restoreEnd = text.indexOf('\n  const pushTimelineHistory =', restoreStart);
if (restoreStart === -1 || restoreEnd === -1) {
  throw new Error('No se encontró restoreTimelineSections de D3.');
}

let restoreBlock = text.slice(restoreStart, restoreEnd);
if (restoreBlock.includes('\n    pushTimelineHistory();')) {
  restoreBlock = restoreBlock.replace(/\n    pushTimelineHistory\(\);/g, '');
  changes += 1;
  console.log('[ok] eliminado registro accidental al restaurar historial');
} else {
  console.log('[skip] restoreTimelineSections ya no registra historial.');
}
text = text.slice(0, restoreStart) + restoreBlock + text.slice(restoreEnd);

// El historial de nuevos movimientos ya se registra directamente en
// commitTimelineSectionPosition (fix anterior), por lo que esta función auxiliar
// queda obsoleta y puede provocar regresiones si vuelve a llamarse por accidente.
const pushStart = text.indexOf('  const pushTimelineHistory = () => {');
const undoStart = text.indexOf('\n  const undoTimelineSectionChange = () => {', pushStart);
if (pushStart !== -1 && undoStart !== -1) {
  text = text.slice(0, pushStart) + text.slice(undoStart + 1);
  changes += 1;
  console.log('[ok] eliminado helper obsoleto pushTimelineHistory');
} else if (pushStart === -1) {
  console.log('[skip] pushTimelineHistory ya eliminado.');
} else {
  throw new Error('Se encontró pushTimelineHistory pero no su límite antes de undo.');
}

const undoStartCheck = text.indexOf('  const undoTimelineSectionChange = () => {');
const redoStartCheck = text.indexOf('\n  const redoTimelineSectionChange = () => {', undoStartCheck);
const redoEndCheck = text.indexOf('\n  const commitTimelineSectionPosition =', redoStartCheck);
if (undoStartCheck === -1 || redoStartCheck === -1 || redoEndCheck === -1) {
  throw new Error('No se encontraron funciones Undo/Redo completas.');
}

const undoBlock = text.slice(undoStartCheck, redoStartCheck);
const redoBlock = text.slice(redoStartCheck, redoEndCheck);

const requiredUndo = [
  'setTimelineHistoryPast((previous) => previous.slice(0, -1));',
  'setTimelineHistoryFuture((previous) => [currentSnapshot, ...previous].slice(0, 30));',
  'restoreTimelineSections(previousSnapshot',
];
for (const needle of requiredUndo) {
  if (!undoBlock.includes(needle)) throw new Error(`Validación Undo falló: falta ${needle}`);
}

const requiredRedo = [
  'setTimelineHistoryFuture((previous) => previous.slice(1));',
  'setTimelineHistoryPast((previous) => [...previous.slice(-29), currentSnapshot]);',
  'restoreTimelineSections(nextSnapshot',
];
for (const needle of requiredRedo) {
  if (!redoBlock.includes(needle)) throw new Error(`Validación Redo falló: falta ${needle}`);
}

const commitStart = text.indexOf('  const commitTimelineSectionPosition = (sectionId, position) => {');
const commitEnd = text.indexOf('\n  const handleTimelineSectionPointerDown =', commitStart);
if (commitStart === -1 || commitEnd === -1) {
  throw new Error('No se encontró commitTimelineSectionPosition.');
}
const commitBlock = text.slice(commitStart, commitEnd);
if (!commitBlock.includes('const historySnapshot = cloneTimelineSections(currentSections);')) {
  throw new Error('El movimiento normal ya no está registrando snapshot directo.');
}
if (!commitBlock.includes('setTimelineHistoryFuture([]);')) {
  throw new Error('El movimiento normal no limpia el historial Redo.');
}

// Verificación clave de la regresión: restaurar nunca debe crear una nueva entrada.
const finalRestoreStart = text.indexOf('  const restoreTimelineSections = (sections, notice) => {');
const finalRestoreEnd = text.indexOf('\n  const undoTimelineSectionChange = () => {', finalRestoreStart);
const finalRestoreBlock = text.slice(finalRestoreStart, finalRestoreEnd);
if (finalRestoreBlock.includes('pushTimelineHistory(')) {
  throw new Error('Regresión: restoreTimelineSections todavía registra historial.');
}
if (finalRestoreBlock.includes('setTimelineHistoryPast(') || finalRestoreBlock.includes('setTimelineHistoryFuture(')) {
  throw new Error('Regresión: restoreTimelineSections no debe mutar Past/Future.');
}

fs.writeFileSync(filePath, text.replace(/\n/g, eol), 'utf8');
console.log(`Multitrack Live Fase 2K-D3 fix v2 aplicada: Undo/Redo ya no re-registra la restauración (${changes} ajuste(s)).`);
