import fs from 'node:fs';

const filePath = 'src/components/live/ProyectorController.jsx';
if (!fs.existsSync(filePath)) throw new Error('No existe ProyectorController.jsx.');

const raw = fs.readFileSync(filePath, 'utf8');
const eol = raw.includes('\r\n') ? '\r\n' : '\n';
let source = raw.replace(/\r\n/g, '\n');
const original = source;

const assertIncludes = (needle, label) => {
  if (!source.includes(needle)) throw new Error('No se encontró ' + label + '.');
};

const replaceExact = (before, after, label) => {
  if (source.includes(after)) {
    console.log('[skip] ' + label + ': ya aplicado.');
    return;
  }
  if (!source.includes(before)) throw new Error('No se encontró el bloque para ' + label + '.');
  source = source.replace(before, after);
  console.log('[ok] ' + label);
};

if (!source.includes('KADOSH_CANVA_RESPONSIVE_WORKSPACE_V1')) {
  throw new Error('Primero aplica scripts/refine-canva-workspace-mobile-desktop-v2.mjs');
}
if (!source.includes('KADOSH_CANVA_OUTPUT_DESK_V1')) {
  throw new Error('Primero aplica scripts/enable-canva-output-desk-page-memory.mjs');
}

// 1) Móvil: los números viven dentro de Control por pantalla.
const deskButtons = `            <div className="mt-2 grid grid-cols-2 gap-2">\n              <button type="button" disabled={currentPage <= 1} onClick={() => changeCanvaPage(currentPage - 1, canvaControlTarget)} className="min-h-10 rounded-xl border border-white/10 bg-white/5 text-[9px] font-black uppercase text-zinc-200 disabled:opacity-30">← Anterior</button>\n              <button type="button" disabled={pageCount > 0 && currentPage >= pageCount} onClick={() => changeCanvaPage(currentPage + 1, canvaControlTarget)} className="min-h-10 rounded-xl border border-cyan-400/20 bg-cyan-500/10 text-[9px] font-black uppercase text-cyan-100 disabled:opacity-30">Siguiente →</button>\n            </div>`;

const deskButtonsWithPages = `            <div className="mt-2 grid grid-cols-2 gap-2">\n              <button type="button" disabled={currentPage <= 1} onClick={() => changeCanvaPage(currentPage - 1, canvaControlTarget)} className="min-h-10 rounded-xl border border-white/10 bg-white/5 text-[9px] font-black uppercase text-zinc-200 disabled:opacity-30">← Anterior</button>\n              <button type="button" disabled={pageCount > 0 && currentPage >= pageCount} onClick={() => changeCanvaPage(currentPage + 1, canvaControlTarget)} className="min-h-10 rounded-xl border border-cyan-400/20 bg-cyan-500/10 text-[9px] font-black uppercase text-cyan-100 disabled:opacity-30">Siguiente →</button>\n            </div>\n            {compact && pageCount > 0 && (\n              <div className="mt-3 border-t border-white/10 pt-3">\n                <div className="mb-2 flex items-center justify-between gap-2">\n                  <p className="text-[8px] font-black uppercase tracking-[0.16em] text-cyan-200">Páginas {canvaSafeWindowStart}-{canvaPageBlockEnd}</p>\n                  <span className="text-[8px] font-black text-zinc-500">{currentPage} / {pageCount}</span>\n                </div>\n                <div className="grid grid-cols-5 gap-2">\n                  {canvaVisiblePages.map((page) => (\n                    <button\n                      key={'output-page-' + page}\n                      type="button"\n                      onClick={() => changeCanvaPage(page, canvaControlTarget)}\n                      className={'min-h-10 rounded-xl border text-xs font-black ' + (currentPage === page ? 'border-cyan-200 bg-cyan-400 text-zinc-950' : 'border-white/10 bg-zinc-900 text-zinc-300')}\n                    >\n                      {page}\n                    </button>\n                  ))}\n                </div>\n                {(canvaSafeWindowStart > 1 || canvaPageBlockEnd < pageCount) && (\n                  <div className="mt-2 grid grid-cols-2 gap-2">\n                    <button type="button" disabled={canvaSafeWindowStart <= 1} onClick={() => setCanvaPageWindowStart(Math.max(1, canvaSafeWindowStart - 10))} className="min-h-9 rounded-xl border border-white/10 bg-zinc-900 text-[8px] font-black uppercase text-zinc-300 disabled:opacity-30">← 10 páginas</button>\n                    <button type="button" disabled={canvaPageBlockEnd >= pageCount} onClick={() => setCanvaPageWindowStart(Math.min(canvaMaxWindowStart, canvaSafeWindowStart + 10))} className="min-h-9 rounded-xl border border-white/10 bg-zinc-900 text-[8px] font-black uppercase text-zinc-300 disabled:opacity-30">10 páginas →</button>\n                  </div>\n                )}\n              </div>\n            )}`;
replaceExact(deskButtons, deskButtonsWithPages, 'páginas dentro de Control por pantalla en móvil');

const mobileWorkspaceMarker = '        {/* KADOSH_CANVA_MOBILE_WORKSPACE_V1 */}';
const mobileWorkspaceStart = source.indexOf(mobileWorkspaceMarker);
if (mobileWorkspaceStart < 0) throw new Error('No se encontró workspace Canva móvil V1.');
const mobilePagesStartMarker = '                {selectedCanvaId && canvaHasConfiguredPageCount && (';
const mobilePagesStart = source.indexOf(mobilePagesStartMarker, mobileWorkspaceStart);
const mobileLibraryMarker = '                <div className="rounded-2xl border border-white/10 bg-black/25 p-3">\n                  <div className="mb-3 flex items-center justify-between gap-3">';
const mobileLibraryStart = source.indexOf(mobileLibraryMarker, mobilePagesStart >= 0 ? mobilePagesStart : mobileWorkspaceStart);
if (mobilePagesStart >= 0 && mobileLibraryStart > mobilePagesStart) {
  source = source.slice(0, mobilePagesStart) + source.slice(mobileLibraryStart);
  console.log('[ok] eliminado bloque móvil separado Ir a página');
} else if (source.includes("key={'output-page-' + page}")) {
  console.log('[skip] bloque móvil separado Ir a página: ya eliminado.');
} else {
  throw new Error('No se pudo localizar el bloque móvil Ir a página.');
}

// 2) PC: mover Vista previa inmediatamente debajo de Control por pantalla.
const previewStartMarker = '                  {canvaPreviewUrl && (\n                    <div className="overflow-hidden rounded-2xl border border-white/10 bg-black shadow-2xl shadow-black/30">';
const previewStart = source.indexOf(previewStartMarker);
if (previewStart < 0) throw new Error('No se encontró la Vista previa Canva desktop.');
const previewEndMarker = '                  )}\n                </div>\n              </div>';
const previewEndBoundary = source.indexOf(previewEndMarker, previewStart);
if (previewEndBoundary < 0) throw new Error('No se encontró el final de la Vista previa Canva desktop.');
const previewEnd = previewEndBoundary + '                  )}'.length;
const previewBlock = source.slice(previewStart, previewEnd);
source = source.slice(0, previewStart) + source.slice(previewEnd);

const deskRenderMarker = '                  {renderCanvaOutputDesk()}';
const deskRenderIndex = source.indexOf(deskRenderMarker);
if (deskRenderIndex < 0) throw new Error('No se encontró Control por pantalla desktop.');
const deskInsertAt = deskRenderIndex + deskRenderMarker.length;
source = source.slice(0, deskInsertAt) + '\n\n' + previewBlock + source.slice(deskInsertAt);
console.log('[ok] Vista previa Canva movida debajo de Control por pantalla en PC');

// 3) PC: ocultar editor/creador inline y abrirlo bajo demanda en el modal compartido.
const desktopGridBefore = '                  <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">';
const desktopGridAfter = '                  <div className="grid gap-4">';
replaceExact(desktopGridBefore, desktopGridAfter, 'biblioteca Canva desktop a ancho completo');

const desktopGridIndex = source.indexOf(desktopGridAfter);
if (desktopGridIndex < 0) throw new Error('No se encontró grid Canva desktop refinado.');
const editorStartMarker = '                    <div className="grid gap-3 rounded-2xl border border-white/10 bg-black/25 p-3 sm:p-4">';
const editorStart = source.indexOf(editorStartMarker, desktopGridIndex);
const libraryStartMarker = '                    <div className="rounded-2xl border border-white/10 bg-black/25 p-3 sm:p-4">';
const libraryStart = source.indexOf(libraryStartMarker, editorStart >= 0 ? editorStart : desktopGridIndex);
if (editorStart >= 0 && libraryStart > editorStart) {
  source = source.slice(0, editorStart) + source.slice(libraryStart);
  console.log('[ok] editor/creador Canva desktop oculto hasta solicitarlo');
} else if (!source.includes('EDITANDO PRESENTACIÓN GUARDADA') && !source.includes('Editando presentación guardada')) {
  console.log('[skip] editor/creador Canva desktop: ya oculto.');
} else {
  throw new Error('No se pudo aislar el editor Canva desktop.');
}

const libraryHeaderBefore = `                          <p className="mt-1 text-[9px] font-bold text-zinc-600">En vivo: {['projector', 'singers', 'musicians'].filter((id) => evento?.canvaOutputs?.[id]?.active).map((id) => id === 'projector' ? 'Proyector' : id === 'singers' ? 'Cantantes' : 'Músicos').join(' · ') || 'ninguna salida'}</p>\n                        </div>\n                      </div>\n                      <div className="grid max-h-[360px] gap-2 overflow-y-auto pr-1 [&::-webkit-scrollbar]:hidden">`;
const libraryHeaderAfter = `                          <p className="mt-1 text-[9px] font-bold text-zinc-600">En vivo: {['projector', 'singers', 'musicians'].filter((id) => evento?.canvaOutputs?.[id]?.active).map((id) => id === 'projector' ? 'Proyector' : id === 'singers' ? 'Cantantes' : 'Músicos').join(' · ') || 'ninguna salida'}</p>\n                        </div>\n                        {canCreateCanva && (\n                          <button type="button" onClick={openMobileCanvaCreate} className="shrink-0 rounded-xl bg-cyan-400 px-3 py-2.5 text-[9px] font-black uppercase text-zinc-950"><Plus size={13} className="mr-1 inline" />Nueva</button>\n                        )}\n                      </div>\n                      <div className="grid max-h-[360px] gap-2 overflow-y-auto pr-1 [&::-webkit-scrollbar]:hidden">`;
replaceExact(libraryHeaderBefore, libraryHeaderAfter, 'botón Nueva en biblioteca Canva desktop');

const editButtonBefore = `<button type="button" onClick={() => selectCanvaPresentation(item)} className="min-h-10 rounded-lg border border-white/10 bg-white/5 px-2 text-[9px] font-black uppercase text-zinc-300 hover:bg-white/10">{canEditCanva ? <Edit2 size={12} className="mr-1 inline" /> : <Eye size={12} className="mr-1 inline" />}{canEditCanva ? 'Editar' : 'Abrir'}</button>`;
const editButtonAfter = `<button type="button" onClick={() => (canEditCanva ? openMobileCanvaEdit(item) : selectCanvaPresentation(item))} className="min-h-10 rounded-lg border border-white/10 bg-white/5 px-2 text-[9px] font-black uppercase text-zinc-300 hover:bg-white/10">{canEditCanva ? <Edit2 size={12} className="mr-1 inline" /> : <Eye size={12} className="mr-1 inline" />}{canEditCanva ? 'Editar' : 'Abrir'}</button>`;
replaceExact(editButtonBefore, editButtonAfter, 'Editar desktop abre editor bajo demanda');

// 4) El modal de edición sirve también en PC, con más ancho.
replaceExact(
  '<div className="fixed inset-0 z-[210] flex flex-col bg-black/90 p-2 backdrop-blur-xl md:hidden">',
  '<div className="fixed inset-0 z-[210] flex flex-col bg-black/90 p-2 backdrop-blur-xl">',
  'modal Canva compartido entre móvil y PC'
);

const modalMarker = '        {showMobileCanvaEditor && (';
const modalStart = source.indexOf(modalMarker);
if (modalStart < 0) throw new Error('No se encontró modal Canva compartido.');
const modalEndMarker = '\n\n        {projectionSourceMode === \'bible\' && (';
const modalEnd = source.indexOf(modalEndMarker, modalStart);
if (modalEnd < 0) throw new Error('No se encontró final del modal Canva.');
let modalBlock = source.slice(modalStart, modalEnd);
modalBlock = modalBlock
  .replace('w-full max-w-lg flex-1', 'w-full max-w-lg md:max-w-3xl flex-1')
  .replace('mx-auto grid max-w-lg grid-cols-2', 'mx-auto grid max-w-lg md:max-w-3xl grid-cols-2');
source = source.slice(0, modalStart) + modalBlock + source.slice(modalEnd);
console.log('[ok] modal Canva ampliado para PC');

// Validaciones finales.
const required = [
  "key={'output-page-' + page}",
  '{renderCanvaOutputDesk()}\n\n                  {canvaPreviewUrl && (',
  'onClick={openMobileCanvaCreate}',
  'openMobileCanvaEdit(item)',
  'md:max-w-3xl',
  'KADOSH_CANVA_MOBILE_WORKSPACE_V1',
];
for (const marker of required) assertIncludes(marker, 'validación final ' + marker);

const deskIndexFinal = source.indexOf('{renderCanvaOutputDesk()}');
const previewIndexFinal = source.indexOf('{canvaPreviewUrl && (', deskIndexFinal);
const libraryIndexFinal = source.indexOf('Mis presentaciones Canva', deskIndexFinal);
if (!(deskIndexFinal >= 0 && previewIndexFinal > deskIndexFinal && libraryIndexFinal > previewIndexFinal)) {
  throw new Error('Validación falló: orden PC debe ser Control por pantalla → Vista previa → Biblioteca.');
}

if (source.includes('projectionSourceMode === \'canva\' && (\n          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4')) {
  throw new Error('Validación falló: reapareció el Canva móvil antiguo.');
}

try {
  fs.writeFileSync(filePath, source.replace(/\n/g, eol), 'utf8');
  console.log('Canva Layout V3 aplicado: páginas dentro del control móvil, preview debajo del control en PC y editor oculto hasta Crear/Editar.');
} catch (error) {
  fs.writeFileSync(filePath, original.replace(/\n/g, eol), 'utf8');
  throw error;
}
