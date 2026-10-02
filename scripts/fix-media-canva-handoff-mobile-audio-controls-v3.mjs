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
  if (source.includes(insertion.trim())) {
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

insertBefore(
  '  const publicPreachingBlocks = useMemo(() => {',
  [
    '  const stopAllCanvaProjection = async () => {',
    '    if (!canProjectCanva) {',
    "      notify('No tienes permiso para retirar Canva.', { type: 'error' });",
    '      return;',
    '    }',
    '    try {',
    '      await clearLegacyCanvaProjection();',
    "      await updateDoc(doc(db, 'eventos', eventoId), { canvaOutputs: {} });",
    "      notify('Canva retirado de todas las pantallas.', { type: 'success' });",
    '    } catch (error) {',
    "      console.error('Error retirando Canva de todas las pantallas:', error);",
    "      notify('No se pudo retirar Canva de todas las pantallas.', { type: 'error' });",
    '    }',
    '  };',
    '',
  ].join('\n'),
  'acción Detener Canva en todas'
);

insertBefore(
  '  const renderMediaTargetSelector = ({ compact = false } = {}) => {',
  [
    '  const stopSelectedMediaOutputs = async () => {',
    '    if (!canProjectMedia) {',
    "      notify('No tienes permiso para retirar Multimedia.', { type: 'error' });",
    '      return;',
    '    }',
    '    const safeTargets = normalizeMediaTargets(mediaTargets);',
    '    if (!hasMediaTargets(safeTargets)) {',
    "      notify('Selecciona al menos un destino.', { type: 'error' });",
    '      return;',
    '    }',
    '    try {',
    "      await enqueueProjectionWrite(() => runTransaction(db, async (transaction) => {",
    "        const eventRef = doc(db, 'eventos', eventoId);",
    '        const snapshot = await transaction.get(eventRef);',
    "        if (!snapshot.exists()) throw new Error('El evento ya no existe.');",
    '        const nextOutputs = { ...(snapshot.data().mediaOutputs || {}) };',
    "        ['projector', 'singers', 'musicians'].forEach((targetId) => {",
    '          if (safeTargets[targetId]) delete nextOutputs[targetId];',
    '        });',
    '        transaction.update(eventRef, { mediaOutputs: nextOutputs });',
    '      }));',
    "      notify('Multimedia retirada de los destinos seleccionados.', { type: 'success' });",
    '    } catch (error) {',
    "      console.error('Error retirando Multimedia por destinos:', error);",
    "      notify('No se pudo retirar Multimedia de los destinos seleccionados.', { type: 'error' });",
    '    }',
    '  };',
    '',
    '  const stopAllMediaOutputs = async () => {',
    '    if (!canProjectMedia) {',
    "      notify('No tienes permiso para retirar Multimedia.', { type: 'error' });",
    '      return;',
    '    }',
    '    try {',
    "      await enqueueProjectionWrite(() => updateDoc(doc(db, 'eventos', eventoId), { mediaOutputs: {} }));",
    '      setMediaActive(null);',
    "      notify('Multimedia detenida en todas las pantallas.', { type: 'success' });",
    '    } catch (error) {',
    "      console.error('Error deteniendo Multimedia en todas las pantallas:', error);",
    "      notify('No se pudo detener Multimedia en todas las pantallas.', { type: 'error' });",
    '    }',
    '  };',
    '',
  ].join('\n'),
  'acciones de retiro Multimedia'
);

replaceOnce(
  '<video src={largePreview.url} autoPlay loop controls className="w-full h-full object-contain" />',
  '<video src={largePreview.url} autoPlay loop controls muted playsInline className="w-full h-full object-contain" />',
  'preview grande de video silenciado'
);

replaceOnce(
  '                        <button type="button" onClick={stopCanvaProjection} className="min-h-12 rounded-xl border border-amber-400/25 bg-amber-500/10 px-3 text-[10px] font-black uppercase tracking-wide text-amber-100 hover:bg-amber-500/20"><PowerOff size={14} className="mr-2 inline" />Retirar de seleccionadas</button>',
  '                        <button type="button" onClick={stopCanvaProjection} className="min-h-12 rounded-xl border border-amber-400/25 bg-amber-500/10 px-3 text-[10px] font-black uppercase tracking-wide text-amber-100 hover:bg-amber-500/20"><PowerOff size={14} className="mr-2 inline" />Retirar de seleccionadas</button>\n                        {canProjectCanva && <button type="button" onClick={stopAllCanvaProjection} className="min-h-12 rounded-xl border border-red-400/25 bg-red-500/10 px-3 text-[10px] font-black uppercase tracking-wide text-red-200 hover:bg-red-500/20"><X size={14} className="mr-2 inline" />Detener Canva en todas</button>}',
  'botón detener Canva en todas escritorio'
);

replaceOnce(
  '            <div className="mb-3 w-full">{renderMediaTargetSelector()}</div>\n            <div className="w-full aspect-video bg-zinc-900 rounded-3xl overflow-hidden border border-white/10 shadow-2xl">',
  '            <div className="mb-3 w-full space-y-2">\n              {renderMediaTargetSelector()}\n              <div className="grid grid-cols-2 gap-2">\n                <button type="button" onClick={stopSelectedMediaOutputs} className="min-h-10 rounded-xl border border-amber-400/25 bg-amber-500/10 px-2 text-[9px] font-black uppercase text-amber-100">Retirar seleccionadas</button>\n                <button type="button" onClick={stopAllMediaOutputs} className="min-h-10 rounded-xl border border-red-400/25 bg-red-500/10 px-2 text-[9px] font-black uppercase text-red-200">Detener en todas</button>\n              </div>\n            </div>\n            <div className="w-full aspect-video bg-zinc-900 rounded-3xl overflow-hidden border border-white/10 shadow-2xl">',
  'acciones Multimedia en preview grande'
);

insertBefore(
  "        {projectionSourceMode === 'songs' && (",
  [
    "        {projectionSourceMode === 'canva' && (",
    '          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 [&::-webkit-scrollbar]:hidden">',
    '            <div className="rounded-2xl border border-cyan-400/20 bg-cyan-500/[0.07] p-4">',
    '              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-cyan-300">Canva móvil</p>',
    '              <p className="mt-1 text-sm font-black text-white">Biblioteca, destinos y páginas</p>',
    '              <p className="mt-2 text-[10px] font-bold text-zinc-500">Sin vista previa automática para evitar audio duplicado y consumo innecesario.</p>',
    '            </div>',
    '            <div className="space-y-2">',
    '              {canvaLibrary.map((item) => (',
    '                <div key={item.id} className="rounded-2xl border border-white/10 bg-black/25 p-3">',
    '                  <button type="button" onClick={() => selectCanvaPresentation(item)} className="w-full text-left">',
    "                    <p className=\"truncate text-sm font-black text-white\">{item.title || 'Presentación Canva'}</p>",
    "                    <p className=\"mt-1 text-[9px] font-bold text-zinc-500\">{Number(item.pageCount) >= 1 ? Math.floor(Number(item.pageCount)) + ' página(s)' : 'Total sin configurar'}</p>",
    '                  </button>',
    '                  {canProjectCanva && <button type="button" onClick={() => projectSavedCanva(item)} className="mt-2 min-h-10 w-full rounded-xl bg-cyan-400 text-[9px] font-black uppercase text-zinc-950">Proyectar</button>}',
    '                </div>',
    '              ))}',
    '              {canvaLibrary.length === 0 && <p className="rounded-2xl border border-white/10 bg-black/25 p-4 text-center text-xs font-bold text-zinc-600">No hay presentaciones guardadas.</p>}',
    '            </div>',
    '            <div className="rounded-2xl border border-white/10 bg-black/25 p-3">',
    '              <div className="grid grid-cols-3 gap-2">',
    "                {[[\'projector\', \'Proyector\'], [\'singers\', \'Cantantes\'], [\'musicians\', \'Músicos\']].map(([targetId, label]) => (",
    '                  <button key={targetId} type="button" onClick={() => toggleCanvaTarget(targetId)} className={canvaTargets[targetId] ? "min-h-11 rounded-xl bg-cyan-400 px-2 text-[9px] font-black uppercase text-zinc-950" : "min-h-11 rounded-xl border border-white/10 bg-zinc-900 px-2 text-[9px] font-black uppercase text-zinc-400"}>{label}</button>',
    '                ))}',
    '              </div>',
    '              <div className="mt-3 grid grid-cols-2 gap-2">',
    '                {canProjectCanva && <button type="button" onClick={projectCanva} className="min-h-11 rounded-xl bg-cyan-400 text-[9px] font-black uppercase text-zinc-950">Proyectar</button>}',
    '                {canProjectCanva && <button type="button" onClick={stopCanvaProjection} className="min-h-11 rounded-xl border border-amber-400/25 bg-amber-500/10 text-[9px] font-black uppercase text-amber-100">Retirar seleccionadas</button>}',
    '                {canProjectCanva && <button type="button" onClick={stopAllCanvaProjection} className="col-span-2 min-h-11 rounded-xl border border-red-400/25 bg-red-500/10 text-[9px] font-black uppercase text-red-200">Detener Canva en todas</button>}',
    '              </div>',
    '            </div>',
    '            {canvaHasConfiguredPageCount && (',
    '              <div className="rounded-2xl border border-white/10 bg-black/25 p-3">',
    '                <p className="mb-2 text-[9px] font-black uppercase text-cyan-200">Páginas {canvaSafeWindowStart}-{canvaPageBlockEnd} de {canvaSafePageCount}</p>',
    '                <div className="grid grid-cols-5 gap-2">',
    '                  {canvaVisiblePages.map((page) => <button key={page} type="button" onClick={() => changeCanvaPage(page)} className={canvaPage === page ? "min-h-11 rounded-xl bg-cyan-400 text-xs font-black text-zinc-950" : "min-h-11 rounded-xl border border-white/10 bg-zinc-900 text-xs font-black text-zinc-300"}>{page}</button>)}',
    '                </div>',
    '              </div>',
    '            )}',
    '          </div>',
    '        )}',
    '',
  ].join('\n'),
  'Canva operativo en móvil'
);

const required = [
  "const canProjectMedia = hasPermission(user, 'multimedia.project')",
  'const stopAllCanvaProjection = async () =>',
  'const stopSelectedMediaOutputs = async () =>',
  'const stopAllMediaOutputs = async () =>',
  'muted playsInline className="w-full h-full object-contain"',
  'Canva móvil',
];
for (const marker of required) {
  if (!source.includes(marker)) throw new Error('Validación interna falló: ' + marker);
}

try {
  fs.writeFileSync(controllerPath, source.replace(/\n/g, eol), 'utf8');
  console.log('Fix v3 aplicado: cierres, audio seguro y Canva móvil.');
} catch (error) {
  fs.writeFileSync(controllerPath, original.replace(/\n/g, eol), 'utf8');
  throw error;
}
