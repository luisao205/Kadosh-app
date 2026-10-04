import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const filePath = 'src/components/live/ProyectorController.jsx';
if (!fs.existsSync(filePath)) throw new Error('No existe ProyectorController.jsx.');

const raw = fs.readFileSync(filePath, 'utf8');
const eol = raw.includes('\r\n') ? '\r\n' : '\n';
let source = raw.replace(/\r\n/g, '\n');
const original = source;

const mobileMarker = '      {/* VISTA MÓVIL (App Remota de 1 Toque - Se oculta en PC) */}';
const footerMarker = '        {/* Barra Flotante Inferior de Estado (Móvil) */}';
const canvaWorkspaceMarker = '        {/* KADOSH_CANVA_MOBILE_WORKSPACE_V1 */}';
const legacyCanvaMarker = '        {/* KADOSH_CANVA_MOBILE_V4 */}';
const songsMarker = "        {projectionSourceMode === 'songs' && (";
const preachingMarker = "        {projectionSourceMode === 'preaching' && (";
const bibleMarker = "        {projectionSourceMode === 'bible' && (";
const mediaMarker = "        {projectionSourceMode === 'media' && (";

const findMobileBounds = (text) => {
  const start = text.indexOf(mobileMarker);
  if (start < 0) throw new Error('No se encontró la vista móvil del Controlador.');
  const footer = text.indexOf(footerMarker, start);
  if (footer < 0) throw new Error('No se encontró la barra inferior móvil.');
  return { start, footer };
};

const countExact = (text, needle) => {
  let count = 0;
  let index = 0;
  while ((index = text.indexOf(needle, index)) >= 0) {
    count += 1;
    index += needle.length;
  }
  return count;
};

if (!source.includes(canvaWorkspaceMarker)) {
  throw new Error('Falta el workspace Canva móvil actual. No se modificó nada.');
}

const currentBounds = findMobileBounds(source);
let currentMobile = source.slice(currentBounds.start, currentBounds.footer);
const currentCounts = {
  songs: countExact(currentMobile, songsMarker),
  preaching: countExact(currentMobile, preachingMarker),
  bible: countExact(currentMobile, bibleMarker),
  media: countExact(currentMobile, mediaMarker),
  canva: countExact(currentMobile, canvaWorkspaceMarker),
};

if (currentCounts.canva !== 1) throw new Error(`Se esperaba 1 Canva móvil actual y hay ${currentCounts.canva}.`);
if (currentMobile.includes(legacyCanvaMarker)) throw new Error('Todavía existe el Canva móvil antiguo. No se modificó nada.');
if (currentCounts.bible !== 1 || currentCounts.media !== 1) {
  throw new Error(`Biblia/Multimedia móvil no están en estado seguro (${currentCounts.bible}, ${currentCounts.media}). No se modificó nada.`);
}
if (currentCounts.songs > 1 || currentCounts.preaching > 1) {
  throw new Error(`Hay bloques móviles duplicados de Canciones/Prédica (${currentCounts.songs}, ${currentCounts.preaching}). No se modificó nada.`);
}

if (currentCounts.songs === 1 && currentCounts.preaching === 1) {
  console.log('[skip] Canciones móvil: ya presente.');
  console.log('[skip] Prédica móvil: ya presente.');
} else {
  let baseline;
  try {
    baseline = execFileSync('git', ['show', `HEAD:${filePath}`], { encoding: 'utf8' }).replace(/\r\n/g, '\n');
  } catch (error) {
    throw new Error('No se pudo leer ProyectorController estable desde HEAD: ' + error.message);
  }

  const baselineBounds = findMobileBounds(baseline);
  const baselineMobile = baseline.slice(baselineBounds.start, baselineBounds.footer);
  const baseSongs = baselineMobile.indexOf(songsMarker);
  const basePreaching = baselineMobile.indexOf(preachingMarker);
  const baseBible = baselineMobile.indexOf(bibleMarker);

  if (!(baseSongs >= 0 && basePreaching > baseSongs && baseBible > basePreaching)) {
    throw new Error('La versión estable no tiene el orden móvil esperado Canciones → Prédica → Biblia.');
  }

  const songsBlock = baselineMobile.slice(baseSongs, basePreaching);
  const preachingBlock = baselineMobile.slice(basePreaching, baseBible);
  if (songsBlock.includes(canvaWorkspaceMarker) || preachingBlock.includes(canvaWorkspaceMarker) || songsBlock.includes(legacyCanvaMarker) || preachingBlock.includes(legacyCanvaMarker)) {
    throw new Error('La recuperación intentó incluir Canva. Cancelado por seguridad.');
  }

  currentMobile = source.slice(currentBounds.start, currentBounds.footer);
  const currentBibleRelative = currentMobile.indexOf(bibleMarker);
  if (currentBibleRelative < 0) throw new Error('No se encontró Biblia móvil como punto seguro de inserción.');
  const insertAt = currentBounds.start + currentBibleRelative;

  let recovery = '';
  if (currentCounts.songs === 0) {
    recovery += songsBlock;
    console.log('[ok] Canciones móvil preparada para restaurar');
  }
  if (currentCounts.preaching === 0) {
    recovery += preachingBlock;
    console.log('[ok] Prédica móvil preparada para restaurar');
  }

  source = source.slice(0, insertAt) + recovery + source.slice(insertAt);
}

const finalBounds = findMobileBounds(source);
const finalMobile = source.slice(finalBounds.start, finalBounds.footer);
const expected = [songsMarker, preachingMarker, bibleMarker, mediaMarker, canvaWorkspaceMarker];
for (const marker of expected) {
  const count = countExact(finalMobile, marker);
  if (count !== 1) throw new Error(`Validación falló: se esperaba 1 bloque y hay ${count} para ${marker}`);
}
if (finalMobile.includes(legacyCanvaMarker)) throw new Error('Validación falló: reapareció el Canva móvil antiguo.');

const order = [
  finalMobile.indexOf(canvaWorkspaceMarker),
  finalMobile.indexOf(songsMarker),
  finalMobile.indexOf(preachingMarker),
  finalMobile.indexOf(bibleMarker),
  finalMobile.indexOf(mediaMarker),
];
if (!(order[0] >= 0 && order[1] > order[0] && order[2] > order[1] && order[3] > order[2] && order[4] > order[3])) {
  throw new Error('Validación falló: el orden móvil final no es Canva → Canciones → Prédica → Biblia → Multimedia.');
}

try {
  fs.writeFileSync(filePath, source.replace(/\n/g, eol), 'utf8');
  console.log('[ok] Canciones móvil restaurado');
  console.log('[ok] Prédica móvil restaurada');
  console.log('[ok] Biblia móvil conservada');
  console.log('[ok] Multimedia móvil conservada');
  console.log('[ok] Canva móvil nuevo conservado sin duplicados');
  console.log('RECOVERY MÓVIL V2 OK: se restauraron únicamente los modos faltantes.');
} catch (error) {
  fs.writeFileSync(filePath, original.replace(/\n/g, eol), 'utf8');
  throw error;
}
