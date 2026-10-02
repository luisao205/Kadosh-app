import fs from 'node:fs';

const controllerPath = 'src/components/live/ProyectorController.jsx';
if (!fs.existsSync(controllerPath)) throw new Error('No existe ProyectorController.jsx.');

const raw = fs.readFileSync(controllerPath, 'utf8');
const eol = raw.includes('\r\n') ? '\r\n' : '\n';
let source = raw.replace(/\r\n/g, '\n');
const original = source;

const replaceOnce = (needle, replacement, label) => {
  if (source.includes(replacement)) {
    console.log('[skip] ' + label + ': ya aplicado.');
    return;
  }
  const index = source.indexOf(needle);
  if (index < 0) throw new Error('No se encontró: ' + label);
  source = source.slice(0, index) + replacement + source.slice(index + needle.length);
  console.log('[ok] ' + label);
};

const insertBefore = (needle, insertion, label) => {
  const marker = insertion.trim();
  if (marker && source.includes(marker)) {
    console.log('[skip] ' + label + ': ya aplicado.');
    return;
  }
  const index = source.indexOf(needle);
  if (index < 0) throw new Error('No se encontró: ' + label);
  source = source.slice(0, index) + insertion + source.slice(index);
  console.log('[ok] ' + label);
};

if (!source.includes('const [mediaTargets, setMediaTargets]')) {
  throw new Error('Primero aplica scripts/enable-controller-media-targets-large-preview.mjs.');
}
if (!source.includes('const renderMediaTargetSelector')) {
  throw new Error('No se encontró el ruteo Multimedia esperado.');
}

replaceOnce(
  "  const canProjectCanva = hasPermission(user, 'canva.project');\n  const canAccessCanva = canViewCanva || canCreateCanva || canEditCanva || canDeleteCanva || canProjectCanva;",
  "  const canProjectCanva = hasPermission(user, 'canva.project');\n  const canProjectMedia = hasPermission(user, 'multimedia.project');\n  const canAccessCanva = canViewCanva || canCreateCanva || canEditCanva || canDeleteCanva || canProjectCanva;",
  'permiso Multimedia en Controlador'
);

const stopAllCanva = String.raw`
  const stopAllCanvaProjection = async () => {
    if (!canProjectCanva) {
      notify('No tienes permiso para retirar Canva.', { type: 'error' });
      return;
    }
    try {
      await clearLegacyCanvaProjection();
      await runTransaction(db, async (transaction) => {
        const eventRef = doc(db, 'eventos', eventoId);
        const snapshot = await transaction.get(eventRef);
        if (!snapshot.exists()) throw new Error('El evento ya no existe.');
        transaction.update(eventRef, { canvaOutputs: {} });
      });
      notify('Canva retirado de todas las pantallas.', { type: 'success' });
    } catch (error) {
      console.error('Error retirando Canva de todas las pantallas:', error);
      notify('No se pudo retirar Canva de todas las pantallas.', { type: 'error' });
    }
  };

`;
insertBefore(
  "  const publicPreachingBlocks = useMemo(() => {",
  stopAllCanva,
  'acción Detener Canva en todas'
);

const mediaActions = String.raw`
  const stopSelectedMediaOutputs = async () => {
    if (!canProjectMedia) {
      notify('No tienes permiso para retirar Multimedia.', { type: 'error' });
      return;
    }
    const safeTargets = normalizeMediaTargets(mediaTargets);
    if (!hasMediaTargets(safeTargets)) {
      notify('Selecciona al menos un destino.', { type: 'error' });
      return;
    }
    try {
      await enqueueProjectionWrite(() => runTransaction(db, async (transaction) => {
        const eventRef = doc(db, 'eventos', eventoId);
        const snapshot = await transaction.get(eventRef);
        if (!snapshot.exists()) throw new Error('El evento ya no existe.');
        const nextOutputs = { ...(snapshot.data().mediaOutputs || {}) };
        ['projector', 'singers', 'musicians'].forEach((targetId) => {
          if (safeTargets[targetId]) delete nextOutputs[targetId];
        });
        transaction.update(eventRef, { mediaOutputs: nextOutputs });
      }));
      notify('Multimedia retirada de los destinos seleccionados.', { type: 'success' });
    } catch (error) {
      console.error('Error retirando Multimedia por destinos:', error);
      notify('No se pudo retirar Multimedia de los destinos seleccionados.', { type: 'error' });
    }
  };

  const stopAllMediaOutputs = async () => {
    if (!canProjectMedia) {
      notify('No tienes permiso para retirar Multimedia.', { type: 'error' });
      return;
    }
    try {
      await enqueueProjectionWrite(() => updateDoc(doc(db, 'eventos', eventoId), { mediaOutputs: {} }));
      setMediaActive(null);
      notify('Multimedia detenida en todas las pantallas.', { type: 'success' });
    } catch (error) {
      console.error('Error deteniendo Multimedia en todas las pantallas:', error);
      notify('No se pudo detener Multimedia en todas las pantallas.', { type: 'error' });
    }
  };

  const renderCanvaTargetSelectorCompact = () => {
    const safeTargets = normalizeCanvaTargets(canvaTargets);
    const options = [
      ['projector', 'Proyector', Monitor],
      ['singers', 'Cantantes', Type],
      ['musicians', 'Músicos', Music],
    ];
    return (
      <div className="rounded-2xl border border-cyan-400/20 bg-cyan-500/[0.06] p-3">
        <p className="mb-2 text-[9px] font-black uppercase tracking-[0.18em] text-cyan-200">Destinos Canva</p>
        <div className="grid grid-cols-3 gap-2">
          {options.map(([targetId, label, Icon]) => (
            <button
              key={targetId}
              type="button"
              onClick={() => toggleCanvaTarget(targetId)}
              className={'min-h-12 rounded-xl border px-2 text-[9px] font-black uppercase ' + (safeTargets[targetId] ? 'border-cyan-200/50 bg-cyan-400 text-zinc-950' : 'border-white/10 bg-zinc-900 text-zinc-400')}
            >
              <Icon size={13} className="mx-auto mb-1" />{label}
            </button>
          ))}
        </div>
      </div>
    );
  };

  const renderMediaStopActions = () => (
    <div className="grid grid-cols-2 gap-2">
      <button
        type="button"
        onClick={stopSelectedMediaOutputs}
        disabled={!canProjectMedia || !hasMediaTargets(mediaTargets)}
        className="min-h-10 rounded-xl border border-amber-400/25 bg-amber-500/10 px-2 text-[9px] font-black uppercase text-amber-100 disabled:opacity-35"
      >
        Retirar seleccionadas
      </button>
      <button
        type="button"
        onClick={stopAllMediaOutputs}
        disabled={!canProjectMedia}
        className="min-h-10 rounded-xl border border-red-400/25 bg-red-500/10 px-2 text-[9px] font-black uppercase text-red-200 disabled:opacity-35"
      >
        Detener en todas
      </button>
    </div>
  );

`;
insertBefore(
  "  const renderMediaTargetSelector = ({ compact = false } = {}) => {",
  mediaActions,
  'acciones y selectores compartidos'
);

replaceOnce(
  '<video src={largePreview.url} autoPlay loop controls className="w-full h-full object-contain" />',
  '<video src={largePreview.url} autoPlay loop controls muted playsInline className="w-full h-full object-contain" />',
  'preview grande siempre silenciado'
);

replaceOnce(
  '                        <button type="button" onClick={stopCanvaProjection} className="min-h-12 rounded-xl border border-amber-400/25 bg-amber-500/10 px-3 text-[10px] font-black uppercase tracking-wide text-amber-100 hover:bg-amber-500/20"><PowerOff size={14} className="mr-2 inline" />Retirar de seleccionadas</button>',
  '                        <button type="button" onClick={stopCanvaProjection} className="min-h-12 rounded-xl border border-amber-400/25 bg-amber-500/10 px-3 text-[10px] font-black uppercase tracking-wide text-amber-100 hover:bg-amber-500/20"><PowerOff size={14} className="mr-2 inline" />Retirar de seleccionadas</button>\n                        {canProjectCanva && <button type="button" onClick={stopAllCanvaProjection} className="min-h-12 rounded-xl border border-red-400/25 bg-red-500/10 px-3 text-[10px] font-black uppercase tracking-wide text-red-200 hover:bg-red-500/20"><X size={14} className="mr-2 inline" />Detener Canva en todas</button>}',
  'botón detener Canva en todas'
);

replaceOnce(
  '            <div className="mb-3 w-full">{renderMediaTargetSelector()}</div>\n            <div className="w-full aspect-video bg-zinc-900 rounded-3xl overflow-hidden border border-white/10 shadow-2xl">',
  '            <div className="mb-3 w-full space-y-2">{renderMediaTargetSelector()}{renderMediaStopActions()}</div>\n            <div className="w-full aspect-video bg-zinc-900 rounded-3xl overflow-hidden border border-white/10 shadow-2xl">',
  'retiro Multimedia en preview grande'
);

replaceOnce(
  '                    <Monitor size={18} /> Proyectar en seleccionadas\n                  </button>\n                </div>',
  '                    <Monitor size={18} /> Proyectar en seleccionadas\n                  </button>\n                  {renderMediaStopActions()}\n                </div>',
  'retiro Multimedia junto a proyectar'
);

replaceOnce(
  '                    <button disabled={!hasMediaTargets(mediaTargets)} onClick={() => { projectMedia(previewMedia); setShowMobileControlsModal(false); }} className="w-full py-3 bg-violet-600 text-white rounded-2xl font-black text-xs uppercase shadow-lg disabled:opacity-40">🚀 PROYECTAR EN SELECCIONADAS</button>',
  '                    <button disabled={!hasMediaTargets(mediaTargets)} onClick={() => { projectMedia(previewMedia); setShowMobileControlsModal(false); }} className="w-full py-3 bg-violet-600 text-white rounded-2xl font-black text-xs uppercase shadow-lg disabled:opacity-40">🚀 PROYECTAR EN SELECCIONADAS</button>\n                    <div className="mt-2">{renderMediaStopActions()}</div>',
  'retiro Multimedia en hoja móvil'
);

const mobileCanvaPanel = String.raw`
        {projectionSourceMode === 'canva' && (
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 [&::-webkit-scrollbar]:hidden">
            {!canAccessCanva ? (
              <div className="rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-center text-xs font-bold text-red-100">No tienes permisos para usar Canva.</div>
            ) : (
              <>
                <div className="rounded-2xl border border-cyan-400/20 bg-cyan-500/[0.07] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-[0.2em] text-cyan-300">Canva móvil</p>
                      <p className="mt-1 text-sm font-black text-white">Biblioteca, destinos y páginas</p>
                    </div>
                    {canCreateCanva && <button type="button" onClick={newCanvaPresentation} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[9px] font-black uppercase text-zinc-200"><Plus size={12} className="mr-1 inline" />Nueva</button>}
                  </div>
                  <p className="mt-2 text-[10px] font-bold leading-relaxed text-zinc-500">El móvil no carga automáticamente la vista previa de Canva, evitando consumo y audio duplicado.</p>
                </div>

                <div className="space-y-2">
                  <p className="text-[9px] font-black uppercase tracking-[0.18em] text-zinc-500">Mis presentaciones</p>
                  {canvaLibrary.length === 0 ? (
                    <p className="rounded-2xl border border-white/10 bg-black/25 p-4 text-center text-xs font-bold text-zinc-600">No hay presentaciones guardadas.</p>
                  ) : canvaLibrary.map((item) => {
                    const selected = selectedCanvaId === item.id;
                    return (
                      <div key={item.id} className={'rounded-2xl border p-3 ' + (selected ? 'border-cyan-300/40 bg-cyan-500/10' : 'border-white/10 bg-black/25')}>
                        <button type="button" onClick={() => selectCanvaPresentation(item)} className="w-full text-left">
                          <p className="truncate text-sm font-black text-white">{item.title || 'Presentación Canva'}</p>
                          <p className="mt-1 text-[9px] font-bold text-zinc-500">{Number(item.pageCount) >= 1 ? Math.floor(Number(item.pageCount)) + ' página(s)' : 'Total de páginas sin configurar'}</p>
                        </button>
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <button type="button" onClick={() => selectCanvaPresentation(item)} className="min-h-10 rounded-xl border border-white/10 bg-white/5 text-[9px] font-black uppercase text-zinc-300">Abrir</button>
                          {canProjectCanva && <button type="button" onClick={() => projectSavedCanva(item)} className="min-h-10 rounded-xl bg-cyan-400 text-[9px] font-black uppercase text-zinc-950">Proyectar</button>}
                        </div>
                      </div>
                    );
                  })}
                </div>

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
                    <input type="number" min="1" max="500" value={canvaPageCount || ''} onChange={(event) => { const value = Math.max(0, Math.min(500, Math.floor(Number(event.target.value) || 0))); setCanvaPageCount(value); setCanvaPage(1); setCanvaPageWindowStart(1); }} disabled={selectedCanvaId ? !canEditCanva : !canCreateCanva} placeholder="Ej. 56" className="min-h-11 rounded-xl border border-white/10 bg-zinc-950 px-3 text-sm font-bold text-white disabled:opacity-50" />
                  </label>

                  {renderCanvaTargetSelectorCompact()}
                  {canvaUrlError && <p className="rounded-xl border border-red-400/20 bg-red-500/10 p-2 text-[10px] font-bold text-red-100">{canvaUrlError}</p>}

                  <div className="grid grid-cols-2 gap-2">
                    {(selectedCanvaId ? canEditCanva : canCreateCanva) && <button type="button" onClick={saveCanvaPresentation} disabled={isSavingCanva} className="min-h-11 rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-2 text-[9px] font-black uppercase text-emerald-100 disabled:opacity-40">{selectedCanvaId ? 'Guardar cambios' : 'Guardar'}</button>}
                    {canProjectCanva && <button type="button" onClick={projectCanva} disabled={!hasTargets(canvaTargets)} className="min-h-11 rounded-xl bg-cyan-400 px-2 text-[9px] font-black uppercase text-zinc-950 disabled:opacity-40">Proyectar</button>}
                    {canProjectCanva && <button type="button" onClick={stopCanvaProjection} className="min-h-11 rounded-xl border border-amber-400/25 bg-amber-500/10 px-2 text-[9px] font-black uppercase text-amber-100">Retirar seleccionadas</button>}
                    {canProjectCanva && <button type="button" onClick={stopAllCanvaProjection} className="min-h-11 rounded-xl border border-red-400/25 bg-red-500/10 px-2 text-[9px] font-black uppercase text-red-200">Detener en todas</button>}
                  </div>
                </div>

                {canvaHasConfiguredPageCount ? (
                  <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <p className="text-[9px] font-black uppercase tracking-[0.18em] text-cyan-200">Páginas {canvaSafeWindowStart}-{canvaPageBlockEnd} de {canvaSafePageCount}</p>
                      <span className="text-[10px] font-black text-white">Actual {canvaPage}</span>
                    </div>
                    <div className="grid grid-cols-5 gap-2">
                      {canvaVisiblePages.map((page) => (
                        <button key={page} type="button" onClick={() => changeCanvaPage(page)} className={'min-h-11 rounded-xl border text-xs font-black ' + (canvaPage === page ? 'border-cyan-200 bg-cyan-400 text-zinc-950' : 'border-white/10 bg-zinc-900 text-zinc-300')}>{page}</button>
                      ))}
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <button type="button" disabled={canvaSafeWindowStart <= 1} onClick={() => setCanvaPageWindowStart(Math.max(1, canvaSafeWindowStart - 10))} className="min-h-10 rounded-xl border border-white/10 bg-zinc-900 text-[9px] font-black uppercase text-zinc-300 disabled:opacity-30">← Bloque anterior</button>
                      <button type="button" disabled={canvaPageBlockEnd >= canvaSafePageCount} onClick={() => setCanvaPageWindowStart(Math.min(canvaMaxWindowStart, canvaSafeWindowStart + 10))} className="min-h-10 rounded-xl border border-white/10 bg-zinc-900 text-[9px] font-black uppercase text-zinc-300 disabled:opacity-30">Bloque siguiente →</button>
                    </div>
                  </div>
                ) : selectedCanvaId ? (
                  <p className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-3 text-center text-[10px] font-bold text-amber-100">Configura la cantidad de páginas y guarda para habilitar la navegación.</p>
                ) : null}
              </>
            )}
          </div>
        )}

`;

replaceOnce(
  '      <div className="relative z-10 md:hidden flex-1 flex flex-col bg-zinc-950/80 overflow-hidden [@media_(orientation:landscape)_and_(max-height:500px)]:flex">\n        {projectionSourceMode === \'songs\' && (',
  '      <div className="relative z-10 md:hidden flex-1 flex flex-col bg-zinc-950/80 overflow-hidden [@media_(orientation:landscape)_and_(max-height:500px)]:flex">\n' + mobileCanvaPanel + '        {projectionSourceMode === \'songs\' && (',
  'panel Canva completo en móvil'
);

const required = [
  "const canProjectMedia = hasPermission(user, 'multimedia.project')",
  'const stopAllCanvaProjection = async () =>',
  'const stopSelectedMediaOutputs = async () =>',
  'const stopAllMediaOutputs = async () =>',
  'const renderCanvaTargetSelectorCompact = () =>',
  'muted playsInline className="w-full h-full object-contain"',
  'Canva móvil',
  'Detener Canva en todas',
];
for (const marker of required) {
  if (!source.includes(marker)) throw new Error('Validación interna falló: ' + marker);
}

try {
  fs.writeFileSync(controllerPath, source.replace(/\n/g, eol), 'utf8');
  console.log('Fix v2 aplicado: cierres explícitos, preview silencioso y Canva móvil.');
} catch (error) {
  fs.writeFileSync(controllerPath, original.replace(/\n/g, eol), 'utf8');
  throw error;
}
