import fs from 'node:fs';

const filePath = 'src/components/live/ProyectorController.jsx';
if (!fs.existsSync(filePath)) throw new Error('No existe ProyectorController.jsx.');

const raw = fs.readFileSync(filePath, 'utf8');
const eol = raw.includes('\r\n') ? '\r\n' : '\n';
let source = raw.replace(/\r\n/g, '\n');
const original = source;

const fail = (message) => { throw new Error(message); };
const assertIncludes = (needle, label) => {
  if (!source.includes(needle)) fail('Validación falló: falta ' + label + '.');
};

if (!source.includes('KADOSH_CANVA_MOBILE_WORKSPACE_V1')) {
  fail('Primero aplica scripts/refine-canva-layout-v3.mjs');
}
if (!source.includes("key={'output-page-' + page}")) {
  fail('No encuentro las páginas dentro de Control por pantalla. Aplica primero Canva Layout V3.');
}

// 1) Móvil: retirar cualquier interfaz Canva antigua que todavía haya quedado antes del workspace V3.
const mobileWorkspaceMarker = '        {/* KADOSH_CANVA_MOBILE_WORKSPACE_V1 */}';
let workspaceIndex = source.indexOf(mobileWorkspaceMarker);
if (workspaceIndex < 0) fail('No se encontró el workspace Canva móvil actual.');

const mobileViewIndex = Math.max(0, source.lastIndexOf('      {/* VISTA MÓVIL', workspaceIndex));
const legacyMarker = '        {/* KADOSH_CANVA_MOBILE_V4 */}';
let legacyStart = source.indexOf(legacyMarker, mobileViewIndex);

if (legacyStart >= 0 && legacyStart < workspaceIndex) {
  source = source.slice(0, legacyStart) + source.slice(workspaceIndex);
  console.log('[ok] interfaz Canva móvil antigua eliminada');
} else {
  workspaceIndex = source.indexOf(mobileWorkspaceMarker);
  const legacyTextIndex = source.lastIndexOf('Canva móvil', workspaceIndex);
  if (legacyTextIndex > mobileViewIndex) {
    const legacyBlockStart = source.lastIndexOf("        {projectionSourceMode === 'canva' && (", legacyTextIndex);
    if (legacyBlockStart < mobileViewIndex) fail('Se detectó Canva móvil antiguo pero no se pudo aislar su bloque.');
    source = source.slice(0, legacyBlockStart) + source.slice(workspaceIndex);
    console.log('[ok] bloque Canva móvil duplicado eliminado por contenido');
  } else {
    console.log('[skip] Canva móvil antiguo: no encontrado.');
  }
}

// 2) Tarjetas Canva: mostrar destinos guardados abreviados debajo del número de páginas.
const destinationLine = "<p className=\"mt-1 text-[8px] font-black uppercase tracking-wide text-cyan-300\">Dest.: {['projector', 'singers', 'musicians'].filter((id) => item.defaultTargets?.[id] === true).map((id) => id === 'projector' ? 'PROY' : id === 'singers' ? 'CANT' : 'MÚS').join(' · ') || 'SIN DEST.'}</p>";

workspaceIndex = source.indexOf(mobileWorkspaceMarker);
const mobileModalIndex = source.indexOf('        {showMobileCanvaEditor && (', workspaceIndex);
if (mobileModalIndex < 0) fail('No se encontró el modal Canva después del workspace móvil.');
let mobileMain = source.slice(workspaceIndex, mobileModalIndex);
if (!mobileMain.includes('Dest.:')) {
  const mobileCount = "<p className=\"mt-1 text-[9px] font-bold text-zinc-500\">{Number(item.pageCount) >= 1 ? Math.floor(Number(item.pageCount)) + ' página(s)' : 'Total sin configurar'}</p>";
  const index = mobileMain.indexOf(mobileCount);
  if (index < 0) fail('No se encontró el contador de páginas en las tarjetas Canva móviles.');
  const insertAt = index + mobileCount.length;
  mobileMain = mobileMain.slice(0, insertAt) + '\n                                ' + destinationLine + mobileMain.slice(insertAt);
  source = source.slice(0, workspaceIndex) + mobileMain + source.slice(mobileModalIndex);
  console.log('[ok] destinos abreviados visibles en tarjetas Canva móviles');
} else {
  console.log('[skip] destinos abreviados móviles: ya aplicados.');
}

const desktopLibraryLabel = 'Mis presentaciones Canva';
const desktopLibraryIndex = source.indexOf(desktopLibraryLabel);
if (desktopLibraryIndex < 0) fail('No se encontró la biblioteca Canva desktop.');
const desktopLibraryStart = Math.max(0, source.lastIndexOf('<div', desktopLibraryIndex));
const desktopLibraryEnd = source.indexOf('            {/* 📺 NUEVO: PANEL DE MULTIMEDIA', desktopLibraryIndex);
let desktopCanvaSlice = source.slice(desktopLibraryStart, desktopLibraryEnd > desktopLibraryIndex ? desktopLibraryEnd : desktopLibraryIndex + 12000);
if (!desktopCanvaSlice.includes('Dest.:')) {
  const desktopCount = "<p className=\"mt-1 text-[9px] font-bold text-zinc-500\">{Number(item.pageCount) >= 1 ? (Math.floor(Number(item.pageCount)) + ' página(s)') : 'Total de páginas sin configurar'}</p>";
  const index = source.indexOf(desktopCount, desktopLibraryIndex);
  if (index < 0) fail('No se encontró el contador de páginas en las tarjetas Canva desktop.');
  const insertAt = index + desktopCount.length;
  source = source.slice(0, insertAt) + '\n                                ' + destinationLine + source.slice(insertAt);
  console.log('[ok] destinos abreviados visibles en tarjetas Canva desktop');
} else {
  console.log('[skip] destinos abreviados desktop: ya aplicados.');
}

// 3) PC: Biblia, igual que Canva, no necesita la columna Setlist.
const setlistConditionBefore = "projectionSourceMode === 'canva' ? 'hidden' : 'flex'";
const setlistConditionAfter = "['canva', 'bible'].includes(projectionSourceMode) ? 'hidden' : 'flex'";
if (source.includes(setlistConditionAfter)) {
  console.log('[skip] Biblia usa ancho completo desktop: ya aplicado.');
} else if (source.includes(setlistConditionBefore)) {
  source = source.replace(setlistConditionBefore, setlistConditionAfter);
  console.log('[ok] Biblia usa el ancho completo del workspace desktop');
} else {
  fail('No se encontró la condición responsive de la columna Setlist.');
}

// 4) PC: dividir Biblia entre Bosquejo/Pasajes y Puntos del mensaje. En móvil sigue apilado.
const biblePanelStartMarker = '  const bibleOutlinePanel = (';
const biblePanelEndMarker = '  const screensMenu =';
let bibleStart = source.indexOf(biblePanelStartMarker);
let bibleEnd = source.indexOf(biblePanelEndMarker, bibleStart);
if (bibleStart < 0 || bibleEnd < 0) fail('No se pudo aislar bibleOutlinePanel.');
let biblePanel = source.slice(bibleStart, bibleEnd);

if (!biblePanel.includes('KADOSH_BIBLE_DESKTOP_SPLIT_V1')) {
  const outerBefore = '    <div className="space-y-3">';
  const outerAfter = '    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)] xl:items-start">\n      {/* KADOSH_BIBLE_DESKTOP_SPLIT_V1 */}\n      <div className="space-y-3">';
  if (!biblePanel.includes(outerBefore)) fail('No se encontró el contenedor principal de Biblia.');
  biblePanel = biblePanel.replace(outerBefore, outerAfter);

  const quickMarker = '      <QuickMessagePanel\n';
  const quickStart = biblePanel.indexOf(quickMarker);
  if (quickStart < 0) fail('No se encontró Puntos del mensaje dentro de Biblia.');
  biblePanel = biblePanel.slice(0, quickStart)
    + '      </div>\n      <div className="min-w-0 xl:sticky xl:top-0 [&>section]:mt-0">\n'
    + biblePanel.slice(quickStart);

  const quickStartAfter = biblePanel.indexOf(quickMarker);
  const quickClose = biblePanel.indexOf('      />', quickStartAfter);
  if (quickClose < 0) fail('No se encontró el cierre de Puntos del mensaje.');
  const afterQuickClose = quickClose + '      />'.length;
  biblePanel = biblePanel.slice(0, afterQuickClose) + '\n      </div>' + biblePanel.slice(afterQuickClose);

  source = source.slice(0, bibleStart) + biblePanel + source.slice(bibleEnd);
  console.log('[ok] Biblia desktop dividida entre Pasajes y Puntos del mensaje');
} else {
  console.log('[skip] división Biblia/Puntos desktop: ya aplicada.');
}

// 5) Validaciones: una sola experiencia Canva móvil y destinos solo dentro del editor.
workspaceIndex = source.indexOf(mobileWorkspaceMarker);
const editorIndexFinal = source.indexOf('        {showMobileCanvaEditor && (', workspaceIndex);
if (workspaceIndex < 0 || editorIndexFinal < 0) fail('Validación móvil incompleta.');
const mobileMainFinal = source.slice(workspaceIndex, editorIndexFinal);
if (mobileMainFinal.includes('Canva móvil')) fail('Sigue existiendo una interfaz Canva móvil duplicada.');
if (mobileMainFinal.includes('renderCanvaTargetSelectorCompact()')) fail('Los destinos siguen visibles fuera de Editar/Crear en móvil.');
if (mobileMainFinal.includes('>Destinos<')) fail('Sigue existiendo un bloque Destinos fuera del editor móvil.');

assertIncludes("key={'output-page-' + page}", 'números dentro de Control por pantalla');
assertIncludes('Dest.:', 'resumen abreviado de destinos Canva');
assertIncludes("['canva', 'bible'].includes(projectionSourceMode) ? 'hidden' : 'flex'", 'Biblia a ancho completo desktop');
assertIncludes('KADOSH_BIBLE_DESKTOP_SPLIT_V1', 'división Biblia/Puntos del mensaje');

try {
  fs.writeFileSync(filePath, source.replace(/\n/g, eol), 'utf8');
  console.log('Canva/Biblia V4 aplicado: móvil sin duplicados ni destinos fuera de editar, tarjetas con destinos abreviados y Biblia desktop a ancho completo con Puntos del mensaje al lado.');
} catch (error) {
  fs.writeFileSync(filePath, original.replace(/\n/g, eol), 'utf8');
  throw error;
}
