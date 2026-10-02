import fs from 'node:fs';

const files = {
  controller: 'src/components/live/ProyectorController.jsx',
  projector: 'src/components/live/Proyector.jsx',
};

const readNormalized = (filePath) => {
  const raw = fs.readFileSync(filePath, 'utf8');
  return {
    eol: raw.includes('\r\n') ? '\r\n' : '\n',
    text: raw.replace(/\r\n/g, '\n'),
  };
};

const writeNormalized = (filePath, text, eol) => {
  fs.writeFileSync(filePath, text.replace(/\n/g, eol), 'utf8');
};

const replaceOnce = (source, needle, replacement, label) => {
  if (source.includes(replacement)) {
    console.log(`[skip] ${label}: ya aplicado.`);
    return source;
  }
  const index = source.indexOf(needle);
  if (index === -1) throw new Error(`No se encontró: ${label}`);
  console.log(`[ok] ${label}`);
  return source.slice(0, index) + replacement + source.slice(index + needle.length);
};

const replaceAllCounted = (source, needle, replacement, label, expectedMinimum = 1) => {
  const count = source.split(needle).length - 1;
  if (count < expectedMinimum) throw new Error(`No se encontró suficiente veces: ${label} (${count}).`);
  const next = source.split(needle).join(replacement);
  console.log(`[ok] ${label}: ${count} reemplazo(s)`);
  return next;
};

const controllerFile = readNormalized(files.controller);
let controller = controllerFile.text;

controller = replaceOnce(
  controller,
  `\n\nconst ProyectorController = ({ user }) => {`,
  `\n\nconst normalizeCanvaEmbedUrl = (value) => {\n  const raw = String(value || '').trim();\n  if (!raw) return '';\n  try {\n    const url = new URL(raw);\n    const host = url.hostname.toLowerCase();\n    const isCanvaHost = host === 'canva.com' || host.endsWith('.canva.com');\n    if (!isCanvaHost || !url.pathname.includes('/design/') || !url.pathname.includes('/view')) return '';\n    url.searchParams.set('embed', '');\n    return url.toString();\n  } catch {\n    return '';\n  }\n};\n\nconst ProyectorController = ({ user }) => {`,
  'normalizador seguro de enlace Canva'
);

controller = replaceOnce(
  controller,
  `  const [projectionSourceMode, setProjectionSourceMode] = useState('songs');\n  const [showScreensMenu, setShowScreensMenu] = useState(false);`,
  `  const [projectionSourceMode, setProjectionSourceMode] = useState('songs');\n  const [canvaDraft, setCanvaDraft] = useState({ title: 'Presentación Canva', url: '' });\n  const [canvaPreviewUrl, setCanvaPreviewUrl] = useState('');\n  const [canvaUrlError, setCanvaUrlError] = useState('');\n  const [showScreensMenu, setShowScreensMenu] = useState(false);`,
  'estado local de Canva'
);

controller = replaceOnce(
  controller,
  `  const publicPreachingBlocks = useMemo(() => {`,
  `  const prepareCanvaPreview = () => {\n    const embedUrl = normalizeCanvaEmbedUrl(canvaDraft.url);\n    if (!embedUrl) {\n      setCanvaPreviewUrl('');\n      setCanvaUrlError('Usa un enlace público de Canva en modo ver, por ejemplo .../design/.../view.');\n      return '';\n    }\n    setCanvaUrlError('');\n    setCanvaPreviewUrl(embedUrl);\n    return embedUrl;\n  };\n\n  const projectCanva = async () => {\n    const embedUrl = normalizeCanvaEmbedUrl(canvaDraft.url);\n    if (!embedUrl) {\n      setCanvaUrlError('Usa un enlace público de Canva en modo ver, por ejemplo .../design/.../view.');\n      notify('El enlace de Canva no es compatible para incrustar.', { type: 'error' });\n      return;\n    }\n\n    const sourceUrl = String(canvaDraft.url || '').trim();\n    const title = String(canvaDraft.title || '').trim() || 'Presentación Canva';\n    const currentState = evento?.projectorState || null;\n    const previousProjectorState = currentState?.contentType === 'canva'\n      ? (currentState.previousProjectorState || null)\n      : currentState;\n    const now = Date.now();\n    const projectionActionId = \`canva-\${now}-\${globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)}\`;\n\n    try {\n      rememberUndoSnapshot();\n      await enqueueProjectionWrite(() => updateDoc(doc(db, 'eventos', eventoId), {\n        projectorState: {\n          type: 'canva',\n          contentType: 'canva',\n          title,\n          canva: { sourceUrl, embedUrl },\n          previousProjectorState,\n          sourceActor: 'multimedia',\n          actorUid: user?.uid || null,\n          actorName: user?.nombre || user?.email || 'Multimedia',\n          updatedAt: now,\n          projectionVersion: now,\n          projectionActionId,\n        },\n        proyectorApagado: false,\n        proyectorLogo: false,\n      }));\n      setCanvaPreviewUrl(embedUrl);\n      setCanvaUrlError('');\n      notify('Canva proyectado.', { type: 'success' });\n    } catch (error) {\n      console.error('Error proyectando Canva:', error);\n      notify('No se pudo proyectar Canva.', { type: 'error' });\n    }\n  };\n\n  const stopCanvaProjection = async () => {\n    const currentState = evento?.projectorState;\n    if (currentState?.contentType !== 'canva') return;\n    try {\n      await enqueueProjectionWrite(() => updateDoc(doc(db, 'eventos', eventoId), {\n        projectorState: currentState.previousProjectorState || null,\n      }));\n      notify('Canva retirado. Se restauró el contenido anterior.', { type: 'success' });\n    } catch (error) {\n      console.error('Error retirando Canva:', error);\n      notify('No se pudo retirar Canva.', { type: 'error' });\n    }\n  };\n\n  const publicPreachingBlocks = useMemo(() => {`,
  'acciones de preview/proyección Canva'
);

controller = replaceOnce(
  controller,
  `          <div className="grid grid-cols-4 gap-1 rounded-2xl border border-white/10 bg-black/30 p-1">\n            {[\n              ['songs', 'Canciones', Music],\n              ['preaching', 'Predica', ShieldCheck],\n              ['bible', 'Biblia', BookOpen],\n              ['media', 'Multimedia', Film]\n            ].map(([mode, label, Icon]) => (`,
  `          <div className="grid grid-cols-5 gap-1 rounded-2xl border border-white/10 bg-black/30 p-1">\n            {[\n              ['songs', 'Canciones', Music],\n              ['preaching', 'Predica', ShieldCheck],\n              ['bible', 'Biblia', BookOpen],\n              ['canva', 'Canva', Tv],\n              ['media', 'Multimedia', Film]\n            ].map(([mode, label, Icon]) => (`,
  'pestaña Canva entre Biblia y Multimedia'
);

controller = replaceOnce(
  controller,
  `              {projectionSourceMode === 'media' ? <Film size={16} className="text-indigo-400"/> : projectionSourceMode === 'songs' ? <Type size={16} className="text-amber-500"/> : <BookOpen size={16} className="text-blue-400"/>}\n              {projectionSourceMode === 'media' ? 'Multimedia' : projectionSourceMode === 'preaching' ? 'Predica' : projectionSourceMode === 'bible' ? 'Biblia' : 'Diapositivas'}`,
  `              {projectionSourceMode === 'media' ? <Film size={16} className="text-indigo-400"/> : projectionSourceMode === 'canva' ? <Tv size={16} className="text-cyan-400"/> : projectionSourceMode === 'songs' ? <Type size={16} className="text-amber-500"/> : <BookOpen size={16} className="text-blue-400"/>}\n              {projectionSourceMode === 'media' ? 'Multimedia' : projectionSourceMode === 'canva' ? 'Canva' : projectionSourceMode === 'preaching' ? 'Predica' : projectionSourceMode === 'bible' ? 'Biblia' : 'Diapositivas'}`,
  'título del panel Canva'
);

controller = replaceOnce(
  controller,
  `            \n            {/* 📺 NUEVO: PANEL DE MULTIMEDIA RÁPIDA (Bóveda) */}`,
  `            \n            {projectionSourceMode === 'canva' && (\n              <div className="min-h-0 flex-1 overflow-y-auto bg-zinc-950/45 border-b border-white/10 p-4 [&::-webkit-scrollbar]:hidden">\n                <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">\n                  <div className="rounded-2xl border border-cyan-400/20 bg-cyan-500/[0.07] p-4">\n                    <div className="flex items-start gap-3">\n                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-500/10 text-cyan-200"><Tv size={18} /></div>\n                      <div className="min-w-0">\n                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-300">Canva</p>\n                        <h3 className="mt-1 text-sm font-black text-white">Presentación externa dentro de Kadosh</h3>\n                        <p className="mt-1 text-[10px] font-bold leading-relaxed text-zinc-500">Pega un enlace público de Canva en modo Ver. Kadosh lo incrusta sin abrir otra pestaña y conserva debajo el contenido que ya estaba proyectado.</p>\n                      </div>\n                    </div>\n                  </div>\n\n                  <div className="grid gap-3 rounded-2xl border border-white/10 bg-black/25 p-4">\n                    <label className="grid gap-1.5">\n                      <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Nombre</span>\n                      <input\n                        type="text"\n                        value={canvaDraft.title}\n                        onChange={(event) => setCanvaDraft((current) => ({ ...current, title: event.target.value }))}\n                        placeholder="Ej. Anuncios del domingo"\n                        className="w-full rounded-xl border border-white/10 bg-zinc-950 px-3 py-2.5 text-xs font-bold text-white outline-none focus:border-cyan-400/40"\n                      />\n                    </label>\n                    <label className="grid gap-1.5">\n                      <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Enlace público de Canva</span>\n                      <input\n                        type="url"\n                        value={canvaDraft.url}\n                        onChange={(event) => {\n                          setCanvaDraft((current) => ({ ...current, url: event.target.value }));\n                          setCanvaUrlError('');\n                        }}\n                        placeholder="https://www.canva.com/design/.../view"\n                        className="w-full rounded-xl border border-white/10 bg-zinc-950 px-3 py-2.5 text-xs font-bold text-white outline-none focus:border-cyan-400/40"\n                      />\n                    </label>\n                    {canvaUrlError && <p className="rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-[10px] font-bold text-red-200">{canvaUrlError}</p>}\n                    <div className="grid gap-2 sm:grid-cols-2">\n                      <button type="button" onClick={prepareCanvaPreview} className="min-h-11 rounded-xl border border-cyan-400/25 bg-cyan-500/10 px-3 text-[10px] font-black uppercase tracking-wide text-cyan-100 hover:bg-cyan-500/20"><Eye size={14} className="mr-2 inline" />Cargar vista previa</button>\n                      <button type="button" onClick={projectCanva} className="min-h-11 rounded-xl bg-cyan-400 px-3 text-[10px] font-black uppercase tracking-wide text-zinc-950 hover:bg-cyan-300"><Monitor size={14} className="mr-2 inline" />Proyectar Canva</button>\n                    </div>\n                  </div>\n\n                  {canvaPreviewUrl && (\n                    <div className="overflow-hidden rounded-2xl border border-white/10 bg-black shadow-2xl shadow-black/30">\n                      <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-zinc-950 px-3 py-2">\n                        <p className="truncate text-[10px] font-black uppercase tracking-wide text-zinc-400">Vista previa · {canvaDraft.title || 'Canva'}</p>\n                        <span className="rounded-full border border-cyan-400/20 bg-cyan-500/10 px-2 py-1 text-[8px] font-black uppercase text-cyan-200">Embed</span>\n                      </div>\n                      <div className="aspect-video w-full bg-black">\n                        <iframe src={canvaPreviewUrl} title="Vista previa Canva" className="h-full w-full border-0" allow="fullscreen" allowFullScreen loading="lazy" />\n                      </div>\n                    </div>\n                  )}\n\n                  {evento?.projectorState?.contentType === 'canva' && (\n                    <button type="button" onClick={stopCanvaProjection} className="min-h-11 rounded-xl border border-amber-400/25 bg-amber-500/10 px-3 text-[10px] font-black uppercase tracking-wide text-amber-100 hover:bg-amber-500/20"><PowerOff size={14} className="mr-2 inline" />Detener Canva y restaurar contenido anterior</button>\n                  )}\n                </div>\n              </div>\n            )}\n\n            {/* 📺 NUEVO: PANEL DE MULTIMEDIA RÁPIDA (Bóveda) */}`,
  'panel principal Canva'
);

controller = replaceOnce(
  controller,
  `                {projectionSourceMode === 'media' && previewMedia ? (`,
  `                {projectionSourceMode === 'canva' && canvaPreviewUrl ? (\n                  <iframe src={canvaPreviewUrl} title="Pre-proyección Canva" className="absolute inset-0 h-full w-full border-0 bg-black" allow="fullscreen" allowFullScreen loading="lazy" />\n                ) : projectionSourceMode === 'media' && previewMedia ? (`,
  'Canva en pre-proyección'
);

controller = replaceOnce(
  controller,
  `                ) : evento?.projectorState?.contentType === 'bible' ? (`,
  `                ) : evento?.projectorState?.contentType === 'canva' ? (\n                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black p-4 text-center">\n                    <Tv size={28} className="text-cyan-300" />\n                    <p className="text-[10px] font-black uppercase tracking-widest text-cyan-200">Canva en vivo</p>\n                    <p className="max-w-[220px] truncate text-xs font-bold text-white">{evento.projectorState.title || 'Presentación Canva'}</p>\n                    <button type="button" onClick={stopCanvaProjection} className="rounded-xl border border-amber-400/25 bg-amber-500/10 px-4 py-2 text-[9px] font-black uppercase tracking-wide text-amber-100">Detener Canva</button>\n                  </div>\n                ) : evento?.projectorState?.contentType === 'bible' ? (`,
  'estado Canva en monitor En Vivo'
);

const controllerChecks = [
  ["['canva', 'Canva', Tv]", 'pestaña Canva'],
  ["projectionSourceMode === 'canva'", 'modo Canva'],
  ['normalizeCanvaEmbedUrl', 'normalizador Canva'],
  ['projectCanva', 'proyección Canva'],
  ['stopCanvaProjection', 'restauración Canva'],
  ['Pre-proyección Canva', 'preview Canva'],
];
for (const [needle, label] of controllerChecks) {
  if (!controller.includes(needle)) throw new Error(`Validación Controller falló: falta ${label}.`);
}

const projectorFile = readNormalized(files.projector);
let projector = projectorFile.text;

projector = replaceOnce(
  projector,
  `  const isQuickMessageContent = Boolean(activeQuickMessageState);\n  const bibleHeading = activeBibleSlide?.heading || null;`,
  `  const isQuickMessageContent = Boolean(activeQuickMessageState);\n  const activeCanvaEmbedUrl = projectorState?.contentType === 'canva' ? String(projectorState?.canva?.embedUrl || '') : '';\n  const bibleHeading = activeBibleSlide?.heading || null;`,
  'detección de Canva activo en proyector'
);

projector = replaceOnce(
  projector,
  `  if (!displaySlide && !media?.url && !showLogo && !countdown?.active && !fondoUrl && !hasProjectedTextContent) {`,
  `  if (!displaySlide && !media?.url && !showLogo && !countdown?.active && !fondoUrl && !hasProjectedTextContent && !activeCanvaEmbedUrl) {`,
  'Canva evita standby'
);

projector = replaceOnce(
  projector,
  `      <ProjectorMediaBackground\n        url={fondoUrl}\n        media={fondoMedia}\n        disabled={modoTransmision || apagar}\n        suspended={Boolean(media?.url && media.mode === 'foreground')}\n      />\n\n      {/* Capa de Video Principal (Foreground) - Tapa todo lo dem?s */}`,
  `      <ProjectorMediaBackground\n        url={fondoUrl}\n        media={fondoMedia}\n        disabled={modoTransmision || apagar}\n        suspended={Boolean(media?.url && media.mode === 'foreground')}\n      />\n\n      {activeCanvaEmbedUrl && (\n        <div className="absolute inset-0 z-[70] bg-black">\n          <iframe\n            src={activeCanvaEmbedUrl}\n            title={projectorState?.title || 'Presentación Canva'}\n            className="h-full w-full border-0 bg-black"\n            allow="fullscreen"\n            allowFullScreen\n          />\n        </div>\n      )}\n\n      {/* Capa de Video Principal (Foreground) - Tapa todo lo dem?s */}`,
  'iframe Canva en salida pública'
);

const projectorChecks = [
  ['activeCanvaEmbedUrl', 'estado Canva'],
  ['title={projectorState?.title', 'iframe Canva'],
  ['z-[70]', 'prioridad visual Canva'],
];
for (const [needle, label] of projectorChecks) {
  if (!projector.includes(needle)) throw new Error(`Validación Proyector falló: falta ${label}.`);
}

writeNormalized(files.controller, controller, controllerFile.eol);
writeNormalized(files.projector, projector, projectorFile.eol);

console.log('Canva agregado al Controlador: pestaña dedicada, preview embebido, proyección pública y restauración del contenido anterior.');
