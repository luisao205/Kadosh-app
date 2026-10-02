import fs from 'node:fs';

const controllerPath = 'src/components/live/ProyectorController.jsx';
if (!fs.existsSync(controllerPath)) throw new Error('No existe ProyectorController.jsx.');

const raw = fs.readFileSync(controllerPath, 'utf8');
const eol = raw.includes('\r\n') ? '\r\n' : '\n';
let source = raw.replace(/\r\n/g, '\n');
const original = source;

const insertBefore = (needle, insertion, label) => {
  if (source.includes(insertion.trim())) {
    console.log('[skip] ' + label + ': ya aplicado.');
    return;
  }
  const index = source.indexOf(needle);
  if (index < 0) throw new Error('No se encontró ancla: ' + label);
  source = source.slice(0, index) + insertion + source.slice(index);
  console.log('[ok] ' + label);
};

const replaceIfPresent = (needle, replacement, label) => {
  if (source.includes(replacement)) {
    console.log('[skip] ' + label + ': ya aplicado.');
    return;
  }
  const index = source.indexOf(needle);
  if (index < 0) {
    console.log('[skip] ' + label + ': variante actual no requiere cambio.');
    return;
  }
  source = source.slice(0, index) + replacement + source.slice(index + needle.length);
  console.log('[ok] ' + label);
};

if (!source.includes('const [mediaTargets, setMediaTargets]')) {
  throw new Error('Falta el ruteo Multimedia. Aplica primero enable-controller-media-targets-large-preview.mjs.');
}
if (!source.includes('const renderMediaTargetSelector')) {
  throw new Error('Falta renderMediaTargetSelector.');
}

// Mantener previews locales sin audio.
replaceIfPresent(
  '<video src={largePreview.url} autoPlay loop controls className="w-full h-full object-contain" />',
  '<video src={largePreview.url} autoPlay loop controls muted playsInline className="w-full h-full object-contain" />',
  'preview grande silenciado'
);

// Si todavía no existe, agregar detener Canva en todas.
if (!source.includes('const stopAllCanvaProjection = async () =>')) {
  insertBefore(
    '  const publicPreachingBlocks = useMemo(() => {',
    [
      '  const stopAllCanvaProjection = async () => {',
      '    if (!canProjectCanva) return;',
      '    try {',
      '      await clearLegacyCanvaProjection();',
      "      await updateDoc(doc(db, 'eventos', eventoId), { canvaOutputs: {} });",
      "      notify('Canva retirado de todas las pantallas.', { type: 'success' });",
      '    } catch (error) {',
      "      console.error('Error retirando Canva:', error);",
      "      notify('No se pudo retirar Canva.', { type: 'error' });",
      '    }',
      '  };',
      '',
    ].join('\n'),
    'detener Canva en todas'
  );
} else {
  console.log('[skip] detener Canva en todas: ya aplicado.');
}

// Canva móvil: panel operativo liviano, sin iframe automático.
if (!source.includes('KADOSH_CANVA_MOBILE_V4')) {
  const mobileAnchor = [
    '      {/* VISTA MÓVIL (App Remota de 1 Toque - Se oculta en PC) */}',
    '      <div className="relative z-10 md:hidden flex-1 flex flex-col bg-zinc-950/80 overflow-hidden [@media_(orientation:landscape)_and_(max-height:500px)]:flex">',
  ].join('\n');
  const anchorIndex = source.indexOf(mobileAnchor);
  if (anchorIndex < 0) throw new Error('No se encontró contenedor móvil del Controlador.');
  const contentStart = anchorIndex + mobileAnchor.length;
  const mobilePanel = [
    '',
    '        {/* KADOSH_CANVA_MOBILE_V4 */}',
    "        {projectionSourceMode === 'canva' && (",
    '          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 [&::-webkit-scrollbar]:hidden">',
    '            <div className="rounded-2xl border border-cyan-400/20 bg-cyan-500/[0.07] p-4">',
    '              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-cyan-300">Canva móvil</p>',
    '              <p className="mt-1 text-sm font-black text-white">Biblioteca, destinos y páginas</p>',
    '              <p className="mt-2 text-[10px] font-bold text-zinc-500">Sin iframe automático: evita audio duplicado y consumo innecesario.</p>',
    '            </div>',
    '',
    '            <div className="space-y-2">',
    '              {canvaLibrary.map((item) => (',
    '                <div key={item.id} className="rounded-2xl border border-white/10 bg-black/25 p-3">',
    '                  <button type="button" onClick={() => selectCanvaPresentation(item)} className="w-full text-left">',
    "                    <p className=\"truncate text-sm font-black text-white\">{item.title || 'Presentación Canva'}</p>",
    "                    <p className=\"mt-1 text-[9px] font-bold text-zinc-500\">{Number(item.pageCount) >= 1 ? Math.floor(Number(item.pageCount)) + ' página(s)' : 'Total sin configurar'}</p>",
    '                  </button>',
    '                  {canProjectCanva && (',
    '                    <button type="button" onClick={() => projectSavedCanva(item)} className="mt-2 min-h-10 w-full rounded-xl bg-cyan-400 text-[9px] font-black uppercase text-zinc-950">Proyectar</button>',
    '                  )}',
    '                </div>',
    '              ))}',
    '              {canvaLibrary.length === 0 && (',
    '                <p className="rounded-2xl border border-white/10 bg-black/25 p-4 text-center text-xs font-bold text-zinc-600">No hay presentaciones guardadas.</p>',
    '              )}',
    '            </div>',
    '',
    '            <div className="rounded-2xl border border-white/10 bg-black/25 p-3">',
    '              <p className="mb-2 text-[9px] font-black uppercase tracking-widest text-cyan-200">Destinos</p>',
    '              <div className="grid grid-cols-3 gap-2">',
    "                {[['projector', 'Proyector'], ['singers', 'Cantantes'], ['musicians', 'Músicos']].map(([targetId, label]) => (",
    '                  <button',
    '                    key={targetId}',
    '                    type="button"',
    '                    onClick={() => toggleCanvaTarget(targetId)}',
    '                    className={canvaTargets[targetId] ? "min-h-11 rounded-xl bg-cyan-400 px-2 text-[9px] font-black uppercase text-zinc-950" : "min-h-11 rounded-xl border border-white/10 bg-zinc-900 px-2 text-[9px] font-black uppercase text-zinc-400"}',
    '                  >',
    '                    {label}',
    '                  </button>',
    '                ))}',
    '              </div>',
    '              <div className="mt-3 grid grid-cols-2 gap-2">',
    '                {canProjectCanva && <button type="button" onClick={projectCanva} className="min-h-11 rounded-xl bg-cyan-400 text-[9px] font-black uppercase text-zinc-950">Proyectar</button>}',
    '                {canProjectCanva && <button type="button" onClick={stopCanvaProjection} className="min-h-11 rounded-xl border border-amber-400/25 bg-amber-500/10 text-[9px] font-black uppercase text-amber-100">Retirar seleccionadas</button>}',
    '                {canProjectCanva && <button type="button" onClick={stopAllCanvaProjection} className="col-span-2 min-h-11 rounded-xl border border-red-400/25 bg-red-500/10 text-[9px] font-black uppercase text-red-200">Detener Canva en todas</button>}',
    '              </div>',
    '            </div>',
    '',
    '            {canvaHasConfiguredPageCount && (',
    '              <div className="rounded-2xl border border-white/10 bg-black/25 p-3">',
    '                <p className="mb-2 text-[9px] font-black uppercase text-cyan-200">Páginas {canvaSafeWindowStart}-{canvaPageBlockEnd} de {canvaSafePageCount}</p>',
    '                <div className="grid grid-cols-5 gap-2">',
    '                  {canvaVisiblePages.map((page) => (',
    '                    <button key={page} type="button" onClick={() => changeCanvaPage(page)} className={canvaPage === page ? "min-h-11 rounded-xl bg-cyan-400 text-xs font-black text-zinc-950" : "min-h-11 rounded-xl border border-white/10 bg-zinc-900 text-xs font-black text-zinc-300"}>{page}</button>',
    '                  ))}',
    '                </div>',
    '                <div className="mt-2 grid grid-cols-2 gap-2">',
    '                  <button type="button" disabled={canvaSafeWindowStart <= 1} onClick={() => setCanvaPageWindowStart(Math.max(1, canvaSafeWindowStart - 10))} className="min-h-10 rounded-xl border border-white/10 bg-zinc-900 text-[9px] font-black uppercase text-zinc-300 disabled:opacity-30">← Anterior</button>',
    '                  <button type="button" disabled={canvaPageBlockEnd >= canvaSafePageCount} onClick={() => setCanvaPageWindowStart(Math.min(canvaMaxWindowStart, canvaSafeWindowStart + 10))} className="min-h-10 rounded-xl border border-white/10 bg-zinc-900 text-[9px] font-black uppercase text-zinc-300 disabled:opacity-30">Siguiente →</button>',
    '                </div>',
    '              </div>',
    '            )}',
    '          </div>',
    '        )}',
  ].join('\n');
  source = source.slice(0, contentStart) + mobilePanel + source.slice(contentStart);
  console.log('[ok] Canva móvil v4');
} else {
  console.log('[skip] Canva móvil v4: ya aplicado.');
}

const required = [
  'const [mediaTargets, setMediaTargets]',
  'const renderMediaTargetSelector',
  'const stopAllCanvaProjection = async () =>',
  'KADOSH_CANVA_MOBILE_V4',
];
for (const marker of required) {
  if (!source.includes(marker)) throw new Error('Validación interna falló: ' + marker);
}

try {
  fs.writeFileSync(controllerPath, source.replace(/\n/g, eol), 'utf8');
  console.log('Fix v4 aplicado: Canva móvil estable y cierre seguro, sin tocar Multitrack.');
} catch (error) {
  fs.writeFileSync(controllerPath, original.replace(/\n/g, eol), 'utf8');
  throw error;
}
