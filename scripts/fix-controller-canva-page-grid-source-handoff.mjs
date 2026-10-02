import fs from 'node:fs';

const files = {
  controller: 'src/components/live/ProyectorController.jsx',
  rules: 'firestore.rules',
};

const readNormalized = (filePath) => {
  const raw = fs.readFileSync(filePath, 'utf8');
  return { eol: raw.includes('\r\n') ? '\r\n' : '\n', text: raw.replace(/\r\n/g, '\n') };
};

const writeNormalized = (filePath, text, eol) => {
  fs.writeFileSync(filePath, text.replace(/\n/g, eol), 'utf8');
};

const replaceOnce = (source, needle, replacement, label) => {
  if (source.includes(replacement)) {
    console.log('[skip] ' + label + ': ya aplicado.');
    return source;
  }
  const index = source.indexOf(needle);
  if (index === -1) throw new Error('No se encontró: ' + label);
  console.log('[ok] ' + label);
  return source.slice(0, index) + replacement + source.slice(index + needle.length);
};

const replaceBetween = (source, startMarker, endMarker, replacement, label) => {
  const start = source.indexOf(startMarker);
  if (start === -1) throw new Error('No se encontró inicio: ' + label);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (end === -1) throw new Error('No se encontró fin: ' + label);
  console.log('[ok] ' + label);
  return source.slice(0, start) + replacement + source.slice(end);
};

const controllerFile = readNormalized(files.controller);
const rulesFile = readNormalized(files.rules);
let controller = controllerFile.text;
let rules = rulesFile.text;

// -----------------------------------------------------------------------------
// 1. Total de páginas persistente + ventana de 10 páginas.
// -----------------------------------------------------------------------------
controller = replaceOnce(
  controller,
  "  const [canvaPage, setCanvaPage] = useState(1);\n  const [showScreensMenu, setShowScreensMenu] = useState(false);",
  "  const [canvaPage, setCanvaPage] = useState(1);\n  const [canvaPageCount, setCanvaPageCount] = useState(1);\n  const [canvaPageWindowStart, setCanvaPageWindowStart] = useState(1);\n  const [showScreensMenu, setShowScreensMenu] = useState(false);",
  'estado de cantidad y ventana de páginas Canva'
);

controller = replaceOnce(
  controller,
  "    setCanvaTargets({ projector: true, singers: false, musicians: false });\n    setCanvaPage(1);\n  };\n\n  const selectCanvaPresentation = (item) => {",
  "    setCanvaTargets({ projector: true, singers: false, musicians: false });\n    setCanvaPage(1);\n    setCanvaPageCount(1);\n    setCanvaPageWindowStart(1);\n  };\n\n  const selectCanvaPresentation = (item) => {",
  'reiniciar cantidad al crear Canva'
);

controller = replaceOnce(
  controller,
  "    setCanvaUrlError('');\n    setCanvaPage(1);\n    setCanvaTargets({\n      projector: item.defaultTargets?.projector === true,",
  "    setCanvaUrlError('');\n    setCanvaPage(1);\n    setCanvaPageCount(Math.max(1, Math.min(500, Math.floor(Number(item.pageCount) || 1))));\n    setCanvaPageWindowStart(1);\n    setCanvaTargets({\n      projector: item.defaultTargets?.projector === true,",
  'cargar cantidad al editar Canva guardado'
);

controller = replaceOnce(
  controller,
  "        sourceUrl: resolved.sourceUrl,\n        embedUrl: resolved.embedUrl,\n        defaultTargets: {",
  "        sourceUrl: resolved.sourceUrl,\n        embedUrl: resolved.embedUrl,\n        pageCount: Math.max(1, Math.min(500, Math.floor(Number(canvaPageCount) || 1))),\n        defaultTargets: {",
  'guardar cantidad de páginas Canva'
);

controller = replaceOnce(
  controller,
  "    setCanvaPreviewUrl(withCanvaPage(item.embedUrl || '', 1));\n    setCanvaTargets(targets);\n    setCanvaPage(1);\n    setCanvaUrlError('');",
  "    setCanvaPreviewUrl(withCanvaPage(item.embedUrl || '', 1));\n    setCanvaTargets(targets);\n    setCanvaPage(1);\n    setCanvaPageCount(Math.max(1, Math.min(500, Math.floor(Number(item.pageCount) || 1))));\n    setCanvaPageWindowStart(1);\n    setCanvaUrlError('');",
  'cantidad de páginas al proyectar Canva guardado'
);

controller = replaceOnce(
  controller,
  "  const changeCanvaPage = async (requestedPage) => {\n    const nextPage = Math.max(1, Math.floor(Number(requestedPage) || 1));",
  "  const changeCanvaPage = async (requestedPage) => {\n    const safePageCount = Math.max(1, Math.min(500, Math.floor(Number(canvaPageCount) || 1)));\n    const nextPage = Math.max(1, Math.min(safePageCount, Math.floor(Number(requestedPage) || 1)));",
  'limitar navegación al total real configurado'
);

controller = replaceOnce(
  controller,
  "    setCanvaPage(nextPage);\n    if (currentPreviewBase) setCanvaPreviewUrl(withCanvaPage(currentPreviewBase, nextPage));",
  "    setCanvaPage(nextPage);\n    setCanvaPageWindowStart((Math.floor((nextPage - 1) / 10) * 10) + 1);\n    if (currentPreviewBase) setCanvaPreviewUrl(withCanvaPage(currentPreviewBase, nextPage));",
  'mantener bloque de números alineado con página actual'
);

const pageWindowHelpers = String.raw`  const canvaSafePageCount = Math.max(1, Math.min(500, Math.floor(Number(canvaPageCount) || 1)));
  const canvaMaxWindowStart = (Math.floor((canvaSafePageCount - 1) / 10) * 10) + 1;
  const canvaSafeWindowStart = Math.max(1, Math.min(canvaPageWindowStart, canvaMaxWindowStart));
  const canvaPageBlockEnd = Math.min(canvaSafeWindowStart + 9, canvaSafePageCount);
  const canvaVisiblePages = Array.from(
    { length: canvaPageBlockEnd - canvaSafeWindowStart + 1 },
    (_, index) => canvaSafeWindowStart + index
  );

`;
controller = replaceOnce(
  controller,
  "  const stopCanvaProjection = async () => {",
  pageWindowHelpers + "  const stopCanvaProjection = async () => {",
  'cálculo de botones 1-10, 11-20, etc.'
);

// Insertar campo de cantidad antes de los destinos.
controller = replaceOnce(
  controller,
  `                      <div className="rounded-2xl border border-white/10 bg-zinc-950/60 p-3">\n                        <p className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Destinos predeterminados</p>`,
  `                      <label className="grid gap-1.5">\n                        <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Cantidad de páginas</span>\n                        <input\n                          type="number"\n                          min="1"\n                          max="500"\n                          value={canvaPageCount}\n                          onChange={(event) => {\n                            const nextCount = Math.max(1, Math.min(500, Math.floor(Number(event.target.value) || 1)));\n                            setCanvaPageCount(nextCount);\n                            if (canvaPage > nextCount) setCanvaPage(nextCount);\n                            setCanvaPageWindowStart((current) => Math.min(current, (Math.floor((nextCount - 1) / 10) * 10) + 1));\n                          }}\n                          className="min-h-11 w-full rounded-xl border border-white/10 bg-zinc-950 px-3 py-2.5 text-xs font-bold text-white outline-none focus:border-cyan-400/40"\n                        />\n                        <span className="text-[9px] font-bold leading-relaxed text-zinc-600">Kadosh usa este total para mostrar solo páginas válidas y agruparlas de 10 en 10.</span>\n                      </label>\n\n                      <div className="rounded-2xl border border-white/10 bg-zinc-950/60 p-3">\n                        <p className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Destinos predeterminados</p>`,
  'campo cantidad de páginas Canva'
);

// Reemplazar controles anterior/input/siguiente por selector tipo Biblia.
const pageGrid = String.raw`                      <div className="border-b border-white/10 bg-zinc-950/90 p-2 sm:p-3">
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="text-[9px] font-black uppercase tracking-[0.16em] text-cyan-300">Páginas {canvaSafeWindowStart}-{canvaPageBlockEnd} de {canvaSafePageCount}</p>
                            <p className="mt-0.5 text-[9px] font-bold text-zinc-600">Actual: {canvaPage}</p>
                          </div>
                          <div className="flex gap-2">
                            <button type="button" onClick={() => changeCanvaPage(canvaPage - 1)} disabled={canvaPage <= 1} className="min-h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-[9px] font-black uppercase text-zinc-200 disabled:cursor-not-allowed disabled:opacity-30">← Anterior</button>
                            <button type="button" onClick={() => changeCanvaPage(canvaPage + 1)} disabled={canvaPage >= canvaSafePageCount} className="min-h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-[9px] font-black uppercase text-zinc-200 disabled:cursor-not-allowed disabled:opacity-30">Siguiente →</button>
                          </div>
                        </div>

                        <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
                          {canvaVisiblePages.map((pageNumber) => (
                            <button
                              key={pageNumber}
                              type="button"
                              onClick={() => changeCanvaPage(pageNumber)}
                              className={'min-h-11 rounded-xl border text-xs font-black transition-colors ' + (canvaPage === pageNumber ? 'border-cyan-200 bg-cyan-400 text-zinc-950 shadow-lg shadow-cyan-500/10' : 'border-white/10 bg-white/5 text-zinc-200 hover:border-cyan-400/30 hover:bg-cyan-500/10')}
                            >
                              {pageNumber}
                            </button>
                          ))}
                        </div>

                        {(canvaSafeWindowStart > 1 || canvaPageBlockEnd < canvaSafePageCount) && (
                          <div className="mt-2 grid gap-2 sm:grid-cols-2">
                            <button
                              type="button"
                              disabled={canvaSafeWindowStart <= 1}
                              onClick={() => setCanvaPageWindowStart(Math.max(1, canvaSafeWindowStart - 10))}
                              className="min-h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-[9px] font-black uppercase text-zinc-300 disabled:cursor-not-allowed disabled:opacity-25"
                            >
                              ← {Math.max(1, canvaSafeWindowStart - 10)}-{canvaSafeWindowStart - 1}
                            </button>
                            <button
                              type="button"
                              disabled={canvaPageBlockEnd >= canvaSafePageCount}
                              onClick={() => setCanvaPageWindowStart(canvaSafeWindowStart + 10)}
                              className="min-h-10 rounded-xl border border-cyan-400/20 bg-cyan-500/10 px-3 text-[9px] font-black uppercase text-cyan-100 disabled:cursor-not-allowed disabled:opacity-25"
                            >
                              {canvaPageBlockEnd + 1}-{Math.min(canvaPageBlockEnd + 10, canvaSafePageCount)} →
                            </button>
                          </div>
                        )}
                        <p className="mt-2 text-center text-[9px] font-bold text-zinc-600">Los números de Kadosh sincronizan todas las salidas que muestran esta presentación.</p>
                      </div>
`;
controller = replaceBetween(
  controller,
  '                      <div className="flex flex-wrap items-center justify-center gap-2 border-b border-white/10 bg-zinc-950/90 p-2 sm:p-3">',
  '                      <div className="aspect-video w-full bg-black">',
  pageGrid,
  'selector numérico Canva tipo Biblia'
);

// Mostrar el total también en la biblioteca.
controller = replaceOnce(
  controller,
  `<p className="mt-1 text-[9px] font-bold uppercase tracking-wide text-cyan-200">{targetSummary}</p>`,
  `<p className="mt-1 text-[9px] font-bold uppercase tracking-wide text-cyan-200">{targetSummary}</p>\n                                <p className="mt-1 text-[9px] font-bold text-zinc-500">{Math.max(1, Number(item.pageCount) || 1)} página(s)</p>`,
  'cantidad visible en tarjetas Canva'
);

// -----------------------------------------------------------------------------
// 2. Cuando se PROYECTA otra fuente, retirar Canva de todas las salidas.
//    No ocurre al cambiar de pestaña: se puede preparar contenido sin cortar Canva.
// -----------------------------------------------------------------------------
controller = replaceOnce(
  controller,
  "    const updates = {\n      announcementState: buildInactiveAnnouncementState(),",
  "    const updates = {\n      canvaOutputs: {},\n      announcementState: buildInactiveAnnouncementState(),",
  'Canciones toman control al proyectar'
);

controller = replaceOnce(
  controller,
  "        transaction.update(eventRef, {\n        announcementState: buildInactiveAnnouncementState(),\n        projectorState: buildCanonicalBibleProjectorState({",
  "        transaction.update(eventRef, {\n        canvaOutputs: {},\n        announcementState: buildInactiveAnnouncementState(),\n        projectorState: buildCanonicalBibleProjectorState({",
  'Biblia toma control al proyectar'
);

controller = replaceOnce(
  controller,
  "    updates.proyectorFondo = null;\n    updates.proyectorFondoMedia = null;\n    try { await enqueueProjectionWrite(() => updateDoc(doc(db, 'eventos', eventoId), updates)); }",
  "    updates.proyectorFondo = null;\n    updates.proyectorFondoMedia = null;\n    updates.canvaOutputs = {};\n    try { await enqueueProjectionWrite(() => updateDoc(doc(db, 'eventos', eventoId), updates)); }",
  'Multimedia toma control al proyectar'
);

// Predica: los dos flujos principales construyen projectorState antes del update.
const preachingNeedle = "        announcementState: buildInactiveAnnouncementState(),\n        projectorState,";
const preachingCount = controller.split(preachingNeedle).length - 1;
if (preachingCount < 2) throw new Error('No se encontraron los dos flujos principales de Predica (' + preachingCount + ').');
controller = controller.split(preachingNeedle).join("        canvaOutputs: {},\n        announcementState: buildInactiveAnnouncementState(),\n        projectorState,");
console.log('[ok] Predica toma control al proyectar: ' + preachingCount + ' reemplazo(s)');

// -----------------------------------------------------------------------------
// 3. Reglas: pageCount persistente y permiso seguro para LIMPIAR canvaOutputs
//    junto con una proyección normal. No permite activar Canva por esa vía.
// -----------------------------------------------------------------------------
rules = replaceOnce(
  rules,
  "          'title', 'inputUrl', 'sourceUrl', 'embedUrl', 'defaultTargets',\n          'createdAt', 'createdBy', 'updatedAt', 'updatedBy'",
  "          'title', 'inputUrl', 'sourceUrl', 'embedUrl', 'pageCount', 'defaultTargets',\n          'createdAt', 'createdBy', 'updatedAt', 'updatedBy'",
  'pageCount permitido en biblioteca Canva'
);

rules = replaceOnce(
  rules,
  "        && request.resource.data.embedUrl is string\n        && request.resource.data.defaultTargets is map",
  "        && request.resource.data.embedUrl is string\n        && request.resource.data.pageCount is int\n        && request.resource.data.pageCount >= 1\n        && request.resource.data.pageCount <= 500\n        && request.resource.data.defaultTargets is map",
  'validación segura de pageCount Canva'
);

rules = replaceOnce(
  rules,
  "        'outputs',\n        'announcementState'",
  "        'outputs',\n        'canvaOutputs',\n        'announcementState'",
  'canvaOutputs permitido en payload estándar'
);

rules = replaceOnce(
  rules,
  "        'proyectorNextSlide', 'proyectorNextSong', 'proyectorOffset', 'liveState', 'currentSongId', 'announcementState'];",
  "        'proyectorNextSlide', 'proyectorNextSong', 'proyectorOffset', 'liveState', 'currentSongId', 'canvaOutputs', 'announcementState'];",
  'canvaOutputs permitido en proyección Biblia'
);

rules = replaceOnce(
  rules,
  "        && onlyEventKeys(projectorEventFields())\n        && (\n          !changedEventKeys().hasAny(['announcementState'])",
  "        && onlyEventKeys(projectorEventFields())\n        && (\n          !changedEventKeys().hasAny(['canvaOutputs'])\n          || (request.resource.data.canvaOutputs is map && request.resource.data.canvaOutputs.keys().size() == 0)\n        )\n        && (\n          !changedEventKeys().hasAny(['announcementState'])",
  'proyección estándar solo puede limpiar Canva, no activarlo'
);

const controllerChecks = [
  'const [canvaPageCount, setCanvaPageCount] = useState(1);',
  'const [canvaPageWindowStart, setCanvaPageWindowStart] = useState(1);',
  'pageCount: Math.max(1, Math.min(500',
  'canvaVisiblePages.map((pageNumber)',
  'canvaOutputs: {},',
  'updates.canvaOutputs = {};',
  'Páginas {canvaSafeWindowStart}-{canvaPageBlockEnd}',
];
for (const marker of controllerChecks) {
  if (!controller.includes(marker)) throw new Error('Validación Controller falló: ' + marker);
}

const rulesChecks = [
  "'pageCount', 'defaultTargets'",
  'request.resource.data.pageCount <= 500',
  "'canvaOutputs',",
  "changedEventKeys().hasAny(['canvaOutputs'])",
  'request.resource.data.canvaOutputs.keys().size() == 0',
];
for (const marker of rulesChecks) {
  if (!rules.includes(marker)) throw new Error('Validación Rules falló: ' + marker);
}

const snapshots = new Map([
  [files.controller, fs.readFileSync(files.controller)],
  [files.rules, fs.readFileSync(files.rules)],
]);

try {
  writeNormalized(files.controller, controller, controllerFile.eol);
  writeNormalized(files.rules, rules, rulesFile.eol);
  console.log('Fix Canva page-grid + source handoff aplicado: páginas 1-10/11-20 y otras fuentes retiran Canva al proyectar.');
} catch (error) {
  for (const [filePath, bytes] of snapshots.entries()) fs.writeFileSync(filePath, bytes);
  throw error;
}
