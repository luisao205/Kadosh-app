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
const modeMarkers = [
  "        {projectionSourceMode === 'songs' && (",
  "        {projectionSourceMode === 'preaching' && (",
  "        {projectionSourceMode === 'bible' && (",
  "        {projectionSourceMode === 'media' && (",
];

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
  throw new Error('Primero aplica Canva Layout V3/V4; falta el workspace Canva móvil actual.');
}

const currentBounds = findMobileBounds(source);
let currentMobile = source.slice(currentBounds.start, currentBounds.footer);
const present = modeMarkers.map((marker) => countExact(currentMobile, marker));
const missingCount = present.filter((count) => count === 0).length;

if (present.every((count) => count === 1)) {
  console.log('[skip] Canciones, Prédica, Biblia y Multimedia móvil: ya están presentes.');
} else if (missingCount === modeMarkers.length) {
  let baseline;
  try {
    baseline = execFileSync('git', ['show', `HEAD:${filePath}`], { encoding: 'utf8' }).replace(/\r\n/g, '\n');
  } catch (error) {
    throw new Error('No se pudo leer la versión estable de ProyectorController desde HEAD: ' + error.message);
  }

  const baselineBounds = findMobileBounds(baseline);
  const baselineMobile = baseline.slice(baselineBounds.start, baselineBounds.footer);
  const songsStart = baselineMobile.indexOf(modeMarkers[0]);
  if (songsStart < 0) throw new Error('La versión estable no contiene Canciones móvil.');

  const recoveryBlock = baselineMobile.slice(songsStart);
  for (const marker of modeMarkers) {
    if (countExact(recoveryBlock, marker) !== 1) {
      throw new Error('La recuperación estable no contiene exactamente un bloque: ' + marker);
    }
  }
  if (recoveryBlock.includes(legacyCanvaMarker) || recoveryBlock.includes(canvaWorkspaceMarker)) {
    throw new Error('La recuperación intentó incluir una interfaz Canva; se canceló por seguridad.');
  }

  source = source.slice(0, currentBounds.footer) + recoveryBlock + '\n\n' + source.slice(currentBounds.footer);
  console.log('[ok] Canciones móvil restaurado');
  console.log('[ok] Prédica móvil restaurada');
  console.log('[ok] Biblia móvil restaurada');
  console.log('[ok] Multimedia móvil restaurada');
} else {
  throw new Error(`Estado móvil parcial inesperado (${present.join(', ')}). No se modificó el archivo para evitar duplicados.`);
}

const finalBounds = findMobileBounds(source);
const finalMobile = source.slice(finalBounds.start, finalBounds.footer);
for (const marker of modeMarkers) {
  const count = countExact(finalMobile, marker);
  if (count !== 1) throw new Error('Validación falló: se esperaba 1 bloque móvil y hay ' + count + ' para ' + marker);
}
if (countExact(finalMobile, canvaWorkspaceMarker) !== 1) {
  throw new Error('Validación falló: debe existir una sola interfaz Canva móvil actual.');
}
if (finalMobile.includes(legacyCanvaMarker)) {
  throw new Error('Validación falló: reapareció el Canva móvil antiguo.');
}

try {
  fs.writeFileSync(filePath, source.replace(/\n/g, eol), 'utf8');
  console.log('RECOVERY MÓVIL OK: Canciones, Prédica, Biblia y Multimedia vuelven sin tocar el nuevo Canva.');
} catch (error) {
  fs.writeFileSync(filePath, original.replace(/\n/g, eol), 'utf8');
  throw error;
}
