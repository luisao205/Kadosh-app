import fs from 'node:fs';

const filePath = 'src/components/live/ProyectorController.jsx';
if (!fs.existsSync(filePath)) throw new Error('No existe ProyectorController.jsx.');

const raw = fs.readFileSync(filePath, 'utf8');
const eol = raw.includes('\r\n') ? '\r\n' : '\n';
let source = raw.replace(/\r\n/g, '\n');
const original = source;

const replaceExact = (before, after, label) => {
  if (source.includes(after)) {
    console.log(`[skip] ${label}: ya aplicado.`);
    return;
  }
  if (!source.includes(before)) throw new Error(`No se encontró el bloque para ${label}.`);
  source = source.replace(before, after);
  console.log(`[ok] ${label}`);
};

const replaceBetween = (startMarker, endMarker, replacement, label) => {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) throw new Error(`No se encontró el rango para ${label}.`);
  source = source.slice(0, start) + replacement + source.slice(end);
  console.log(`[ok] ${label}`);
};

if (!source.includes('KADOSH_CANVA_OUTPUT_DESK_V1')) {
  throw new Error('Primero aplica scripts/enable-canva-output-desk-page-memory.mjs');
}

// 1) Estados del editor móvil bajo demanda.
replaceExact(
  `  const [canvaControlTarget, setCanvaControlTarget] = useState('projector');\n  const [showScreensMenu, setShowScreensMenu] = useState(false);`,
  `  const [canvaControlTarget, setCanvaControlTarget] = useState('projector');\n  // KADOSH_CANVA_RESPONSIVE_WORKSPACE_V1\n  const [showMobileCanvaEditor, setShowMobileCanvaEditor] = useState(false);\n  const [showMobileCanvaPreview, setShowMobileCanvaPreview] = useState(false);\n  const [showMobileCanvaPages, setShowMobileCanvaPages] = useState(false);\n  const [showScreensMenu, setShowScreensMenu] = useState(false);`,
  'estado del workspace Canva móvil'
);

// 2) Helpers para abrir creación/edición sin ocupar toda la pantalla principal.
const helperAnchor = '  const saveCanvaPresentation = async () => {';
if (!source.includes('const openMobileCanvaCreate = () => {')) {
  if (!source.includes(helperAnchor)) throw new Error('No se encontró saveCanvaPresentation.');
  const helpers = `  const openMobileCanvaCreate = () => {\n    newCanvaPresentation();\n    setShowMobileCanvaPreview(false);\n    setShowMobileCanvaPages(false);\n    setShowMobileCanvaEditor(true);\n  };\n\n  const openMobileCanvaEdit = (item) => {\n    selectCanvaPresentation(item);\n    setShowMobileCanvaPreview(false);\n    setShowMobileCanvaPages(false);\n    setShowMobileCanvaEditor(true);\n  };\n\n  const closeMobileCanvaEditor = () => {\n    setShowMobileCanvaPreview(false);\n    setShowMobileCanvaEditor(false);\n  };\n\n  const openExplicitMobileCanvaPreview = async () => {\n    const previewUrl = await prepareCanvaPreview();\n    if (previewUrl) setShowMobileCanvaPreview(true);\n  };\n\n`;
  source = source.replace(helperAnchor, helpers + helperAnchor);
  console.log('[ok] apertura de editor Canva móvil en modal');
} else {
  console.log('[skip] apertura de editor Canva móvil en modal: ya aplicada.');
}

// 3) PC: Canva no necesita la columna Setlist; usar ese ancho para trabajar cómodo.
replaceExact(
  `        <div className="w-1/4 min-w-[250px] min-h-0 bg-zinc-950/55 border-r border-white/10 flex flex-col backdrop-blur-sm">`,
  `        <div className={\`w-1/4 min-w-[250px] min-h-0 bg-zinc-950/55 border-r border-white/10 flex-col backdrop-blur-sm ${projectionSourceMode === 'canva' ? 'hidden' : 'flex'}\`}>`,
  'ocultar Setlist solo mientras se trabaja en Canva desktop'
);

replaceExact(
  `                <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">`,
  `                <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">`,
  'workspace Canva desktop más ancho'
);

replaceExact(
  `                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)]">`,
  `                  <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">`,
  'editor y biblioteca Canva desktop con mejor proporción'
);

// 4) Móvil: sustituir el formulario largo inline por Control + Biblioteca + editor modal.
const mobileStart = `        {projectionSourceMode === 'canva' && (\n          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 [&::-webkit-scrollbar]:hidden">`;
const mobileEnd = `\n\n        {projectionSourceMode === 'bible' && (`;
if (!source.includes('KADOSH_CANVA_MOBILE_WORKSPACE_V1')) {
  const mobileBlock = String.raw`        {/* KADOSH_CANVA_MOBILE_WORKSPACE_V1 */}
        {projectionSourceMode === 'canva' && (
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 pb-[calc(env(safe-area-inset-bottom)+7.5rem)] [&::-webkit-scrollbar]:hidden">
            {!canAccessCanva ? (
              <div className="rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-center text-xs font-bold text-red-100">No tienes permisos para usar Canva.</div>
            ) : (
              <div className="mx-auto flex w-full max-w-xl flex-col gap-3">
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-cyan-400/20 bg-cyan-500/[0.07] p-3">
                  <div className="min-w-0">
                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-cyan-300">Canva</p>
                    <p className="mt-1 truncate text-sm font-black text-white">Control y biblioteca</p>
                    <p className="mt-1 text-[9px] font-bold text-zinc-500">Controla cada pantalla sin abrir formularios largos.</p>
                  </div>
                  {canCreateCanva && (
                    <button type="button" onClick={openMobileCanvaCreate} className="shrink-0 rounded-xl bg-cyan-400 px-3 py-2.5 text-[9px] font-black uppercase text-zinc-950 shadow-lg shadow-cyan-950/20">
                      <Plus size={13} className="mr-1 inline" /> Nueva
                    </button>
                  )}
                </div>

                {renderCanvaOutputDesk({ compact: true })}

                {selectedCanvaId && canvaHasConfiguredPageCount && (
                  <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/25">
                    <button
                      type="button"
                      onClick={() => setShowMobileCanvaPages((current) => !current)}
                      className="flex min-h-12 w-full items-center justify-between gap-3 px-3 text-left"
                    >
                      <div className="min-w-0">
                        <p className="text-[9px] font-black uppercase tracking-[0.16em] text-cyan-200">Ir a página</p>
                        <p className="mt-0.5 truncate text-[10px] font-bold text-zinc-500">{canvaDraft.title || 'Presentación Canva'} · actual {canvaPage} / {canvaSafePageCount}</p>
                      </div>
                      <ChevronRight size={15} className={'shrink-0 text-zinc-500 transition-transform ' + (showMobileCanvaPages ? 'rotate-90' : '')} />
                    </button>
                    {showMobileCanvaPages && (
                      <div className="border-t border-white/10 p-3">
                        <div className="grid grid-cols-5 gap-2">
                          {canvaVisiblePages.map((page) => (
                            <button key={page} type="button" onClick={() => changeCanvaPage(page)} className={'min-h-10 rounded-xl border text-xs font-black ' + (canvaPage === page ? 'border-cyan-200 bg-cyan-400 text-zinc-950' : 'border-white/10 bg-zinc-900 text-zinc-300')}>{page}</button>
                          ))}
                        </div>
                        {(canvaSafeWindowStart > 1 || canvaPageBlockEnd < canvaSafePageCount) && (
                          <div className="mt-2 grid grid-cols-2 gap-2">
                            <button type="button" disabled={canvaSafeWindowStart <= 1} onClick={() => setCanvaPageWindowStart(Math.max(1, canvaSafeWindowStart - 10))} className="min-h-10 rounded-xl border border-white/10 bg-zinc-900 text-[9px] font-black uppercase text-zinc-300 disabled:opacity-30">← Bloque</button>
                            <button type="button" disabled={canvaPageBlockEnd >= canvaSafePageCount} onClick={() => setCanvaPageWindowStart(Math.min(canvaMaxWindowStart, canvaSafeWindowStart + 10))} className="min-h-10 rounded-xl border border-white/10 bg-zinc-900 text-[9px] font-black uppercase text-zinc-300 disabled:opacity-30">Bloque →</button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-[0.18em] text-zinc-500">Mis presentaciones</p>
                      <p className="mt-1 text-[10px] font-bold text-zinc-600">{canvaLibrary.length} guardada{canvaLibrary.length === 1 ? '' : 's'}</p>
                    </div>
                    {canProjectCanva && Object.values(evento?.canvaOutputs || {}).some((output) => output?.active) && (
                      <button type="button" onClick={stopAllCanvaProjection} className="rounded-xl border border-red-400/20 bg-red-500/10 px-2.5 py-2 text-[8px] font-black uppercase text-red-200">Detener todas</button>
                    )}
                  </div>

                  <div className="space-y-2">
                    {canvaLibrary.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-white/10 p-5 text-center">
                        <Tv size={22} className="mx-auto text-zinc-700" />
                        <p className="mt-2 text-xs font-bold text-zinc-600">No hay presentaciones guardadas.</p>
                        {canCreateCanva && <button type="button" onClick={openMobileCanvaCreate} className="mt-3 rounded-xl bg-cyan-400 px-4 py-2 text-[9px] font-black uppercase text-zinc-950">Crear primera</button>}
                      </div>
                    ) : canvaLibrary.map((item) => {
                      const selected = selectedCanvaId === item.id;
                      const liveTargets = ['projector', 'singers', 'musicians'].filter((targetId) => evento?.canvaOutputs?.[targetId]?.active && evento.canvaOutputs[targetId].presentationId === item.id);
                      return (
                        <div key={item.id} className={'rounded-xl border p-3 ' + (selected ? 'border-cyan-300/35 bg-cyan-500/10' : 'border-white/10 bg-zinc-950/60')}>
                          <button type="button" onClick={() => selectCanvaPresentation(item)} className="w-full text-left">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-black text-white">{item.title || 'Presentación Canva'}</p>
                                <p className="mt-1 text-[9px] font-bold text-zinc-500">{Number(item.pageCount) >= 1 ? Math.floor(Number(item.pageCount)) + ' página(s)' : 'Total sin configurar'}</p>
                              </div>
                              {liveTargets.length > 0 && <span className="shrink-0 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2 py-1 text-[8px] font-black uppercase text-emerald-200">En vivo</span>}
                            </div>
                            {liveTargets.length > 0 && <p className="mt-2 text-[8px] font-black uppercase tracking-wide text-cyan-300">{liveTargets.map((targetId) => CANVA_OUTPUT_DESK_META[targetId]?.label).filter(Boolean).join(' · ')}</p>}
                          </button>
                          <div className="mt-3 grid grid-cols-2 gap-2">
                            <button type="button" onClick={() => openMobileCanvaEdit(item)} className="min-h-10 rounded-xl border border-white/10 bg-white/5 text-[9px] font-black uppercase text-zinc-300">Editar</button>
                            {canProjectCanva && <button type="button" onClick={() => projectSavedCanva(item)} className="min-h-10 rounded-xl bg-cyan-400 text-[9px] font-black uppercase text-zinc-950">Proyectar</button>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {showMobileCanvaEditor && (
          <div className="fixed inset-0 z-[210] flex flex-col bg-black/90 p-2 backdrop-blur-xl md:hidden">
            <div className="mx-auto flex min-h-0 w-full max-w-lg flex-1 flex-col overflow-hidden rounded-[1.75rem] border border-white/10 bg-zinc-950 shadow-2xl">
              <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-[9px] font-black uppercase tracking-[0.18em] text-cyan-300">{selectedCanvaId ? 'Editar Canva' : 'Nueva presentación'}</p>
                  <p className="mt-1 truncate text-sm font-black text-white">{canvaDraft.title || 'Presentación Canva'}</p>
                </div>
                <button type="button" onClick={closeMobileCanvaEditor} className="rounded-xl border border-white/10 bg-white/5 p-2 text-zinc-400"><X size={18}/></button>
              </div>

              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 pb-28 [&::-webkit-scrollbar]:hidden">
                <div className="space-y-3 rounded-2xl border border-white/10 bg-black/25 p-3">
                  <label className="grid gap-1.5">
                    <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Nombre</span>
                    <input value={canvaDraft.title} onChange={(event) => setCanvaDraft((current) => ({ ...current, title: event.target.value }))} disabled={selectedCanvaId ? !canEditCanva : !canCreateCanva} className="min-h-11 rounded-xl border border-white/10 bg-zinc-950 px-3 text-sm font-bold text-white disabled:opacity-50" />
                  </label>
                  <label className="grid gap-1.5">
                    <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Enlace Canva</span>
                    <input value={canvaDraft.url} onChange={(event) => setCanvaDraft((current) => ({ ...current, url: event.target.value }))} disabled={selectedCanvaId ? !canEditCanva : !canCreateCanva} placeholder="canva.link/... o /view" className="min-h-11 rounded-xl border border-white/10 bg-zinc-950 px-3 text-xs font-bold text-white disabled:opacity-50" />
                  </label>
                  <label className="grid gap-1.5">
                    <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Cantidad de páginas</span>
                    <input type="number" min="1" max="500" value={canvaPageCount || ''} onChange={(event) => { const value = Math.max(0, Math.min(500, Math.floor(Number(event.target.value) || 0))); setCanvaPageCount(value); if (value && canvaPage > value) setCanvaPage(value); setCanvaPageWindowStart(1); }} disabled={selectedCanvaId ? !canEditCanva : !canCreateCanva} placeholder="Ej. 56" className="min-h-11 rounded-xl border border-white/10 bg-zinc-950 px-3 text-sm font-bold text-white disabled:opacity-50" />
                  </label>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
                  <p className="mb-2 text-[9px] font-black uppercase tracking-[0.16em] text-cyan-200">Destinos predeterminados</p>
                  {renderCanvaTargetSelectorCompact()}
                </div>

                {canvaUrlError && <p className="rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-[10px] font-bold text-red-100">{canvaUrlError}</p>}

                <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={openExplicitMobileCanvaPreview} className="min-h-11 rounded-xl border border-cyan-400/20 bg-cyan-500/10 text-[9px] font-black uppercase text-cyan-100"><Eye size={13} className="mr-1 inline" /> Vista previa</button>
                    {canProjectCanva && <button type="button" onClick={projectCanva} disabled={!hasTargets(canvaTargets)} className="min-h-11 rounded-xl bg-cyan-400 px-2 text-[9px] font-black uppercase text-zinc-950 disabled:opacity-40">Proyectar</button>}
                    {canProjectCanva && <button type="button" onClick={stopCanvaProjection} className="min-h-11 rounded-xl border border-amber-400/25 bg-amber-500/10 px-2 text-[9px] font-black uppercase text-amber-100">Retirar seleccionadas</button>}
                    {canProjectCanva && <button type="button" onClick={stopAllCanvaProjection} className="min-h-11 rounded-xl border border-red-400/25 bg-red-500/10 px-2 text-[9px] font-black uppercase text-red-200">Detener todas</button>}
                  </div>
                </div>

                {showMobileCanvaPreview && canvaPreviewUrl && (
                  <div className="overflow-hidden rounded-2xl border border-cyan-400/20 bg-black">
                    <div className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
                      <p className="text-[9px] font-black uppercase text-cyan-200">Vista previa</p>
                      <button type="button" onClick={() => setShowMobileCanvaPreview(false)} className="text-[9px] font-black uppercase text-zinc-500">Ocultar</button>
                    </div>
                    <div className="aspect-video w-full bg-black">
                      <iframe key={canvaPreviewUrl} src={canvaPreviewUrl} title="Vista previa Canva móvil" className="h-full w-full border-0" allow="fullscreen" allowFullScreen loading="lazy" />
                    </div>
                  </div>
                )}

                {selectedCanvaId && canvaHasConfiguredPageCount && (
                  <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
                    <p className="mb-2 text-[9px] font-black uppercase text-cyan-200">Página de trabajo · {canvaPage} / {canvaSafePageCount}</p>
                    <div className="grid grid-cols-5 gap-2">
                      {canvaVisiblePages.map((page) => (
                        <button key={page} type="button" onClick={() => changeCanvaPage(page)} className={'min-h-10 rounded-xl border text-xs font-black ' + (canvaPage === page ? 'border-cyan-200 bg-cyan-400 text-zinc-950' : 'border-white/10 bg-zinc-900 text-zinc-300')}>{page}</button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="absolute inset-x-2 bottom-2 mx-auto grid max-w-lg grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-zinc-950/95 p-3 shadow-2xl backdrop-blur-xl">
                <button type="button" onClick={closeMobileCanvaEditor} className="min-h-11 rounded-xl border border-white/10 bg-white/5 text-[9px] font-black uppercase text-zinc-300">Cerrar</button>
                {(selectedCanvaId ? canEditCanva : canCreateCanva) && <button type="button" onClick={saveCanvaPresentation} disabled={isSavingCanva} className="min-h-11 rounded-xl bg-emerald-600 text-[9px] font-black uppercase text-white disabled:opacity-40">{isSavingCanva ? 'Guardando…' : selectedCanvaId ? 'Guardar cambios' : 'Guardar'}</button>}
              </div>
            </div>
          </div>
        )}`;

  replaceBetween(mobileStart, mobileEnd, mobileBlock, 'workspace Canva móvil organizado por secciones y modal');
} else {
  console.log('[skip] workspace Canva móvil organizado: ya aplicado.');
}

const required = [
  'KADOSH_CANVA_RESPONSIVE_WORKSPACE_V1',
  'KADOSH_CANVA_MOBILE_WORKSPACE_V1',
  'const openMobileCanvaCreate = () => {',
  'showMobileCanvaEditor &&',
  "projectionSourceMode === 'canva' ? 'hidden' : 'flex'",
  'max-w-6xl',
];
for (const marker of required) {
  if (!source.includes(marker)) throw new Error('Validación falló: falta ' + marker);
}

try {
  fs.writeFileSync(filePath, source.replace(/\n/g, eol), 'utf8');
  console.log('Workspace Canva refinado: desktop gana ancho y móvil usa Control + Biblioteca + editor modal sin perder funciones.');
} catch (error) {
  fs.writeFileSync(filePath, original.replace(/\n/g, eol), 'utf8');
  throw error;
}
