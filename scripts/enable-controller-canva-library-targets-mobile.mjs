import fs from 'node:fs';
const files = {
  controller: 'src/components/live/ProyectorController.jsx',
  projector: 'src/components/live/Proyector.jsx',
  singers: 'src/components/live/StageDisplayCantantes.jsx',
  musicians: 'src/components/live/StageDisplayMusicos.jsx',
  rules: 'firestore.rules',
  internalCanva: 'src/components/live/InternalScreenCanva.jsx',
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

const assertIncludes = (source, needles, label) => {
  for (const needle of needles) {
    if (!source.includes(needle)) throw new Error('Validación falló en ' + label + ': ' + needle);
  }
};

const controllerFile = readNormalized(files.controller);
const projectorFile = readNormalized(files.projector);
const singersFile = readNormalized(files.singers);
const musiciansFile = readNormalized(files.musicians);
const rulesFile = readNormalized(files.rules);
let controller = controllerFile.text;
let projector = projectorFile.text;
let singers = singersFile.text;
let musicians = musiciansFile.text;
let rules = rulesFile.text;

controller = replaceOnce(
  controller,
  "  const [canvaUrlError, setCanvaUrlError] = useState('');\n  const [showScreensMenu, setShowScreensMenu] = useState(false);",
  "  const [canvaUrlError, setCanvaUrlError] = useState('');\n  const [canvaLibrary, setCanvaLibrary] = useState([]);\n  const [selectedCanvaId, setSelectedCanvaId] = useState('');\n  const [canvaTargets, setCanvaTargets] = useState({ projector: true, singers: false, musicians: false });\n  const [isSavingCanva, setIsSavingCanva] = useState(false);\n  const [showScreensMenu, setShowScreensMenu] = useState(false);",
  'estado de biblioteca y destinos Canva'
);

const libraryEffect = String.raw`  useEffect(() => {
    if (!canProjectCanva) {
      setCanvaLibrary([]);
      return undefined;
    }

    const libraryQuery = query(collection(db, 'canvaPresentations'), orderBy('updatedAt', 'desc'));
    const unsubscribe = onSnapshot(libraryQuery, (snapshot) => {
      setCanvaLibrary(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
    }, (error) => {
      console.error('Error leyendo biblioteca Canva:', error);
    });
    return () => unsubscribe();
  }, [canProjectCanva]);

`;
controller = replaceOnce(
  controller,
  "  const openControllerScreen = (path) => {",
  libraryEffect + "  const openControllerScreen = (path) => {",
  'suscripción a biblioteca Canva'
);

const canvaLogic = String.raw`  const resolveCanvaDraft = async () => {
    const candidate = extractCanvaUrlCandidate(canvaDraft.url);
    const directEmbedUrl = normalizeCanvaEmbedUrl(candidate);
    if (directEmbedUrl) return { inputUrl: candidate, sourceUrl: candidate, embedUrl: directEmbedUrl };
    if (!isCanvaShortLink(candidate)) return null;

    const response = await resolveCanvaEmbedLink({ url: candidate });
    const sourceUrl = String(response?.data?.sourceUrl || '').trim();
    const embedUrl = String(response?.data?.embedUrl || '').trim();
    if (!sourceUrl || !embedUrl || !normalizeCanvaEmbedUrl(embedUrl)) return null;
    return { inputUrl: candidate, sourceUrl, embedUrl };
  };

  const prepareCanvaPreview = async () => {
    try {
      const resolved = await resolveCanvaDraft();
      if (!resolved) {
        setCanvaPreviewUrl('');
        setCanvaUrlError('Pega un enlace canva.link, un enlace /design/.../view o el código de inserción de Canva.');
        return '';
      }
      setCanvaUrlError('');
      setCanvaPreviewUrl(resolved.embedUrl);
      return resolved.embedUrl;
    } catch (error) {
      console.error('Error resolviendo enlace Canva:', error);
      setCanvaPreviewUrl('');
      setCanvaUrlError('No se pudo resolver este enlace de Canva.');
      return '';
    }
  };

  const hasSelectedCanvaTarget = () => Object.values(canvaTargets).some(Boolean);

  const toggleCanvaTarget = (targetId) => {
    setCanvaTargets((current) => ({ ...current, [targetId]: !current[targetId] }));
  };

  const newCanvaPresentation = () => {
    setSelectedCanvaId('');
    setCanvaDraft({ title: 'Presentación Canva', url: '' });
    setCanvaPreviewUrl('');
    setCanvaUrlError('');
    setCanvaTargets({ projector: true, singers: false, musicians: false });
  };

  const selectCanvaPresentation = (item) => {
    setSelectedCanvaId(item.id);
    setCanvaDraft({
      title: item.title || 'Presentación Canva',
      url: item.inputUrl || item.sourceUrl || '',
    });
    setCanvaPreviewUrl(item.embedUrl || '');
    setCanvaUrlError('');
    setCanvaTargets({
      projector: item.defaultTargets?.projector === true,
      singers: item.defaultTargets?.singers === true,
      musicians: item.defaultTargets?.musicians === true,
    });
  };

  const saveCanvaPresentation = async () => {
    if (!canProjectCanva || isSavingCanva) return;
    if (!hasSelectedCanvaTarget()) {
      setCanvaUrlError('Selecciona al menos una pantalla como destino predeterminado.');
      return;
    }

    setIsSavingCanva(true);
    try {
      const resolved = await resolveCanvaDraft();
      if (!resolved) {
        setCanvaUrlError('No se pudo validar el enlace de Canva para guardarlo.');
        return;
      }

      const now = Date.now();
      const existing = canvaLibrary.find((item) => item.id === selectedCanvaId);
      const ref = selectedCanvaId
        ? doc(db, 'canvaPresentations', selectedCanvaId)
        : doc(collection(db, 'canvaPresentations'));
      const payload = {
        title: String(canvaDraft.title || '').trim() || 'Presentación Canva',
        inputUrl: resolved.inputUrl || extractCanvaUrlCandidate(canvaDraft.url),
        sourceUrl: resolved.sourceUrl,
        embedUrl: resolved.embedUrl,
        defaultTargets: {
          projector: canvaTargets.projector === true,
          singers: canvaTargets.singers === true,
          musicians: canvaTargets.musicians === true,
        },
        createdAt: existing?.createdAt || now,
        createdBy: existing?.createdBy || user?.uid || '',
        updatedAt: now,
        updatedBy: user?.uid || '',
      };
      await setDoc(ref, payload, { merge: true });
      setSelectedCanvaId(ref.id);
      setCanvaPreviewUrl(resolved.embedUrl);
      setCanvaUrlError('');
      notify('Presentación Canva guardada con sus destinos.', { type: 'success' });
    } catch (error) {
      console.error('Error guardando Canva:', error);
      notify('No se pudo guardar la presentación Canva.', { type: 'error' });
    } finally {
      setIsSavingCanva(false);
    }
  };

  const deleteCanvaPresentation = async (item) => {
    if (!item?.id || !canProjectCanva) return;
    if (!window.confirm('¿Eliminar "' + (item.title || 'Presentación Canva') + '" de la biblioteca?')) return;
    try {
      await deleteDoc(doc(db, 'canvaPresentations', item.id));
      if (selectedCanvaId === item.id) newCanvaPresentation();
      notify('Presentación Canva eliminada de la biblioteca.', { type: 'success' });
    } catch (error) {
      console.error('Error eliminando Canva:', error);
      notify('No se pudo eliminar la presentación Canva.', { type: 'error' });
    }
  };

  const projectCanva = async () => {
    if (!canProjectCanva) {
      notify('No tienes permiso para proyectar Canva.', { type: 'error' });
      return;
    }
    if (!hasSelectedCanvaTarget()) {
      setCanvaUrlError('Selecciona al menos un destino antes de proyectar.');
      return;
    }

    let resolved;
    try {
      resolved = await resolveCanvaDraft();
    } catch (error) {
      console.error('Error resolviendo enlace Canva:', error);
      setCanvaUrlError('No se pudo resolver este enlace de Canva.');
      notify('No se pudo resolver el enlace de Canva.', { type: 'error' });
      return;
    }
    if (!resolved) {
      setCanvaUrlError('Pega un enlace canva.link, un enlace /design/.../view o el código de inserción de Canva.');
      return;
    }

    const title = String(canvaDraft.title || '').trim() || 'Presentación Canva';
    const now = Date.now();
    const nextOutputs = { ...(evento?.canvaOutputs || {}) };
    const outputState = {
      active: true,
      presentationId: selectedCanvaId || '',
      title,
      sourceUrl: resolved.sourceUrl,
      embedUrl: resolved.embedUrl,
      updatedAt: now,
      updatedBy: user?.nombre || user?.email || 'Multimedia',
    };

    ['projector', 'singers', 'musicians'].forEach((targetId) => {
      if (canvaTargets[targetId]) {
        nextOutputs[targetId] = outputState;
        return;
      }
      const existing = nextOutputs[targetId];
      const isSamePresentation = selectedCanvaId
        ? existing?.presentationId === selectedCanvaId
        : existing?.sourceUrl === resolved.sourceUrl;
      if (isSamePresentation) delete nextOutputs[targetId];
    });

    try {
      await enqueueProjectionWrite(() => updateDoc(doc(db, 'eventos', eventoId), { canvaOutputs: nextOutputs }));
      setCanvaPreviewUrl(resolved.embedUrl);
      setCanvaUrlError('');
      notify('Canva enviado a las pantallas seleccionadas.', { type: 'success' });
    } catch (error) {
      console.error('Error proyectando Canva por destinos:', error);
      notify('No se pudo enviar Canva a las pantallas seleccionadas.', { type: 'error' });
    }
  };

  const stopCanvaProjection = async () => {
    if (!hasSelectedCanvaTarget()) return;
    const nextOutputs = { ...(evento?.canvaOutputs || {}) };
    ['projector', 'singers', 'musicians'].forEach((targetId) => {
      if (canvaTargets[targetId]) delete nextOutputs[targetId];
    });
    try {
      await enqueueProjectionWrite(() => updateDoc(doc(db, 'eventos', eventoId), { canvaOutputs: nextOutputs }));
      notify('Canva retirado de los destinos seleccionados.', { type: 'success' });
    } catch (error) {
      console.error('Error retirando Canva por destinos:', error);
      notify('No se pudo retirar Canva de las pantallas seleccionadas.', { type: 'error' });
    }
  };

`;
controller = replaceBetween(
  controller,
  '  const resolveCanvaDraft = async () => {',
  '  const publicPreachingBlocks = useMemo(() => {',
  canvaLogic,
  'lógica Canva: biblioteca, destinos y proyección independiente'
);

controller = replaceOnce(
  controller,
  '<div className="grid grid-cols-5 gap-1 rounded-2xl border border-white/10 bg-black/30 p-1">',
  '<div className="grid grid-cols-2 gap-1 rounded-2xl border border-white/10 bg-black/30 p-1 sm:grid-cols-5">',
  'tabs del controlador adaptadas a móvil'
);

const canvaPanel = String.raw`            {projectionSourceMode === 'canva' && (
              <div className="min-h-0 flex-1 overflow-y-auto border-b border-white/10 bg-zinc-950/45 p-3 sm:p-4 [&::-webkit-scrollbar]:hidden">
                <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
                  <div className="rounded-2xl border border-cyan-400/20 bg-cyan-500/[0.07] p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-500/10 text-cyan-200"><Tv size={19} /></div>
                      <div className="min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-300">Canva · Biblioteca y destinos</p>
                        <h3 className="mt-1 text-sm font-black text-white">Guarda cada presentación y decide dónde se muestra</h3>
                        <p className="mt-1 text-[10px] font-bold leading-relaxed text-zinc-500">Los destinos quedan guardados por presentación. Proyector, Cantantes y Músicos pueden conservar contenidos distintos al mismo tiempo.</p>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)]">
                    <div className="grid gap-3 rounded-2xl border border-white/10 bg-black/25 p-3 sm:p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">{selectedCanvaId ? 'Editando presentación guardada' : 'Nueva presentación'}</p>
                        <button type="button" onClick={newCanvaPresentation} className="min-h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-[9px] font-black uppercase text-zinc-300 hover:bg-white/10"><Plus size={13} className="mr-1 inline" />Nueva</button>
                      </div>

                      <label className="grid gap-1.5">
                        <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Nombre</span>
                        <input type="text" value={canvaDraft.title} onChange={(event) => setCanvaDraft((current) => ({ ...current, title: event.target.value }))} placeholder="Ej. Jesús" className="min-h-11 w-full rounded-xl border border-white/10 bg-zinc-950 px-3 py-2.5 text-xs font-bold text-white outline-none focus:border-cyan-400/40" />
                      </label>

                      <label className="grid gap-1.5">
                        <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Enlace o código de inserción de Canva</span>
                        <input type="url" value={canvaDraft.url} onChange={(event) => { setCanvaDraft((current) => ({ ...current, url: event.target.value })); setCanvaUrlError(''); }} placeholder="https://canva.link/... o enlace /view" className="min-h-11 w-full rounded-xl border border-white/10 bg-zinc-950 px-3 py-2.5 text-xs font-bold text-white outline-none focus:border-cyan-400/40" />
                      </label>

                      <div className="rounded-2xl border border-white/10 bg-zinc-950/60 p-3">
                        <p className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Destinos predeterminados</p>
                        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                          {[
                            ['projector', 'Proyector', Monitor],
                            ['singers', 'Cantantes', Type],
                            ['musicians', 'Músicos', Music],
                          ].map(([targetId, label, Icon]) => {
                            const active = canvaTargets[targetId] === true;
                            return (
                              <button key={targetId} type="button" onClick={() => toggleCanvaTarget(targetId)} className={'min-h-12 rounded-xl border px-3 text-[10px] font-black uppercase transition-colors ' + (active ? 'border-cyan-300/50 bg-cyan-400 text-zinc-950' : 'border-white/10 bg-white/5 text-zinc-400 hover:bg-white/10')}>
                                <Icon size={15} className="mr-2 inline" />{active ? '✓ ' : ''}{label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {canvaUrlError && <p className="rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-[10px] font-bold text-red-200">{canvaUrlError}</p>}

                      <div className="grid gap-2 sm:grid-cols-2">
                        <button type="button" onClick={prepareCanvaPreview} className="min-h-12 rounded-xl border border-cyan-400/25 bg-cyan-500/10 px-3 text-[10px] font-black uppercase tracking-wide text-cyan-100 hover:bg-cyan-500/20"><Eye size={14} className="mr-2 inline" />Vista previa</button>
                        <button type="button" onClick={saveCanvaPresentation} disabled={isSavingCanva} className="min-h-12 rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-3 text-[10px] font-black uppercase tracking-wide text-emerald-100 hover:bg-emerald-500/20 disabled:opacity-50">{isSavingCanva ? <Loader2 size={14} className="mr-2 inline animate-spin" /> : <Star size={14} className="mr-2 inline" />}Guardar presentación</button>
                        <button type="button" onClick={projectCanva} className="min-h-12 rounded-xl bg-cyan-400 px-3 text-[10px] font-black uppercase tracking-wide text-zinc-950 hover:bg-cyan-300"><Monitor size={14} className="mr-2 inline" />Proyectar en seleccionadas</button>
                        <button type="button" onClick={stopCanvaProjection} className="min-h-12 rounded-xl border border-amber-400/25 bg-amber-500/10 px-3 text-[10px] font-black uppercase tracking-wide text-amber-100 hover:bg-amber-500/20"><PowerOff size={14} className="mr-2 inline" />Retirar de seleccionadas</button>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-black/25 p-3 sm:p-4">
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <div>
                          <p className="text-[9px] font-black uppercase tracking-widest text-cyan-300">Mis presentaciones Canva</p>
                          <p className="mt-1 text-[10px] font-bold text-zinc-500">{canvaLibrary.length} guardada(s)</p>
                        </div>
                      </div>
                      <div className="grid max-h-[360px] gap-2 overflow-y-auto pr-1 [&::-webkit-scrollbar]:hidden">
                        {canvaLibrary.length ? canvaLibrary.map((item) => {
                          const selected = item.id === selectedCanvaId;
                          const targetSummary = [
                            item.defaultTargets?.projector ? 'Proyector' : '',
                            item.defaultTargets?.singers ? 'Cantantes' : '',
                            item.defaultTargets?.musicians ? 'Músicos' : '',
                          ].filter(Boolean).join(' · ') || 'Sin destinos';
                          return (
                            <div key={item.id} className={'rounded-xl border p-3 ' + (selected ? 'border-cyan-300/40 bg-cyan-500/10' : 'border-white/10 bg-zinc-950/65')}>
                              <button type="button" onClick={() => selectCanvaPresentation(item)} className="w-full text-left">
                                <p className="truncate text-xs font-black text-white">{item.title || 'Presentación Canva'}</p>
                                <p className="mt-1 text-[9px] font-bold uppercase tracking-wide text-cyan-200">{targetSummary}</p>
                                <p className="mt-1 truncate text-[9px] text-zinc-600">{item.inputUrl || item.sourceUrl}</p>
                              </button>
                              <div className="mt-2 grid grid-cols-2 gap-2">
                                <button type="button" onClick={() => selectCanvaPresentation(item)} className="min-h-10 rounded-lg border border-white/10 bg-white/5 px-2 text-[9px] font-black uppercase text-zinc-300 hover:bg-white/10">Cargar</button>
                                <button type="button" onClick={() => deleteCanvaPresentation(item)} className="min-h-10 rounded-lg border border-red-400/20 bg-red-500/10 px-2 text-[9px] font-black uppercase text-red-200 hover:bg-red-500/20"><Trash2 size={12} className="mr-1 inline" />Eliminar</button>
                              </div>
                            </div>
                          );
                        }) : (
                          <div className="rounded-xl border border-dashed border-white/10 p-5 text-center text-[10px] font-bold text-zinc-600">Todavía no hay presentaciones Canva guardadas.</div>
                        )}
                      </div>
                    </div>
                  </div>

                  {canvaPreviewUrl && (
                    <div className="overflow-hidden rounded-2xl border border-white/10 bg-black shadow-2xl shadow-black/30">
                      <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-zinc-950 px-3 py-2">
                        <p className="truncate text-[10px] font-black uppercase tracking-wide text-zinc-400">Vista previa · {canvaDraft.title || 'Canva'}</p>
                        <span className="rounded-full border border-cyan-400/20 bg-cyan-500/10 px-2 py-1 text-[8px] font-black uppercase text-cyan-200">Embed</span>
                      </div>
                      <div className="aspect-video w-full bg-black">
                        <iframe src={canvaPreviewUrl} title="Vista previa Canva" className="h-full w-full border-0" allow="fullscreen" allowFullScreen loading="lazy" />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

`;
controller = replaceBetween(
  controller,
  "            {projectionSourceMode === 'canva' && (",
  '            {/* 📺 NUEVO: PANEL DE MULTIMEDIA RÁPIDA (Bóveda) */}',
  canvaPanel,
  'panel Canva con biblioteca, destinos y móvil'
);

controller = replaceOnce(
  controller,
  "evento?.projectorState?.contentType === 'canva' ? (",
  "(evento?.canvaOutputs?.projector?.active || evento?.projectorState?.contentType === 'canva') ? (",
  'preview en vivo reconoce Canva por destino'
);
controller = replaceOnce(
  controller,
  "{evento.projectorState.title || 'Presentación Canva'}",
  "{evento?.canvaOutputs?.projector?.title || evento?.projectorState?.title || 'Presentación Canva'}",
  'título Canva en vivo por destino'
);

projector = replaceOnce(
  projector,
  "import QuickMessagePresentation from './QuickMessagePresentation';",
  "import QuickMessagePresentation from './QuickMessagePresentation';\nimport InternalScreenCanva from './InternalScreenCanva';",
  'import Canva en Proyector'
);
projector = replaceOnce(
  projector,
  "  const [announcementState, setAnnouncementState] = useState(null);",
  "  const [announcementState, setAnnouncementState] = useState(null);\n  const [canvaOutput, setCanvaOutput] = useState(null);",
  'estado Canva dirigido en Proyector'
);
projector = replaceOnce(
  projector,
  "        setAnnouncementState(data.announcementState || null);",
  "        setAnnouncementState(data.announcementState || null);\n        setCanvaOutput(data.canvaOutputs?.projector || null);",
  'escuchar destino Canva del Proyector'
);
projector = replaceOnce(
  projector,
  "  if (apagar) return <div className=\"fixed inset-0 bg-black animate-in fade-in duration-700\"></div>;",
  "  if (apagar) return <div className=\"fixed inset-0 bg-black animate-in fade-in duration-700\"></div>;\n  if (canvaOutput?.active && canvaOutput?.embedUrl) return <InternalScreenCanva state={canvaOutput} label=\"Canva en proyector\" />;",
  'override Canva independiente en Proyector'
);

singers = replaceOnce(
  singers,
  "import QuickMessagePresentation from './QuickMessagePresentation';",
  "import QuickMessagePresentation from './QuickMessagePresentation';\nimport InternalScreenCanva from './InternalScreenCanva';",
  'import Canva en Cantantes'
);
singers = replaceOnce(
  singers,
  "      <InternalScreenBlackout active={evento?.proyectorApagado === true} />",
  "      <InternalScreenBlackout active={evento?.proyectorApagado === true} />\n      <InternalScreenCanva state={evento?.canvaOutputs?.singers} label=\"Canva en retorno de cantantes\" />",
  'Canva dirigido a Cantantes'
);

musicians = replaceOnce(
  musicians,
  "import QuickMessagePresentation from './QuickMessagePresentation';",
  "import QuickMessagePresentation from './QuickMessagePresentation';\nimport InternalScreenCanva from './InternalScreenCanva';",
  'import Canva en Músicos'
);
musicians = replaceOnce(
  musicians,
  "      <InternalScreenBlackout active={evento?.proyectorApagado === true} />",
  "      <InternalScreenBlackout active={evento?.proyectorApagado === true} />\n      <InternalScreenCanva state={evento?.canvaOutputs?.musicians} label=\"Canva en retorno de músicos\" />",
  'Canva dirigido a Músicos'
);

rules = replaceOnce(
  rules,
  "    function canUpdateEventBibleOutline() {",
  String.raw`    function validCanvaOutputState(state) {
      return state is map
        && state.keys().hasOnly(['active', 'presentationId', 'title', 'sourceUrl', 'embedUrl', 'updatedAt', 'updatedBy'])
        && state.active == true
        && state.presentationId is string
        && state.title is string
        && state.sourceUrl is string
        && state.embedUrl is string
        && state.updatedAt is int
        && state.updatedBy is string;
    }

    function validCanvaOutputsMap() {
      let outputs = request.resource.data.canvaOutputs;
      return outputs is map
        && outputs.keys().hasOnly(['projector', 'singers', 'musicians'])
        && (!('projector' in outputs) || validCanvaOutputState(outputs.projector))
        && (!('singers' in outputs) || validCanvaOutputState(outputs.singers))
        && (!('musicians' in outputs) || validCanvaOutputState(outputs.musicians));
    }

    function canUpdateEventCanvaOutputs() {
      return hasPermission('canva.project')
        && onlyEventKeys(['canvaOutputs'])
        && validCanvaOutputsMap();
    }

    function canUpdateEventBibleOutline() {`,
  'reglas para Canva por salida'
);

rules = replaceOnce(
  rules,
  "          || canUpdateEventBibleOutline()\n          || canUpdateEventAsParticipant()",
  "          || canUpdateEventBibleOutline()\n          || canUpdateEventCanvaOutputs()\n          || canUpdateEventAsParticipant()",
  'autorizar cambios aislados de canvaOutputs'
);

rules = replaceOnce(
  rules,
  "    match /mediaLibrary/{mediaId} {",
  String.raw`    function validCanvaPresentationDocument() {
      return request.resource.data.keys().hasOnly([
          'title', 'inputUrl', 'sourceUrl', 'embedUrl', 'defaultTargets',
          'createdAt', 'createdBy', 'updatedAt', 'updatedBy'
        ])
        && request.resource.data.title is string
        && request.resource.data.title != ''
        && request.resource.data.inputUrl is string
        && request.resource.data.sourceUrl is string
        && request.resource.data.embedUrl is string
        && request.resource.data.defaultTargets is map
        && request.resource.data.defaultTargets.keys().hasOnly(['projector', 'singers', 'musicians'])
        && request.resource.data.defaultTargets.projector is bool
        && request.resource.data.defaultTargets.singers is bool
        && request.resource.data.defaultTargets.musicians is bool
        && request.resource.data.createdAt is int
        && request.resource.data.createdBy is string
        && request.resource.data.updatedAt is int
        && request.resource.data.updatedBy is string;
    }

    match /canvaPresentations/{presentationId} {
      allow read: if signedIn();
      allow create, update: if hasPermission('canva.project') && validCanvaPresentationDocument();
      allow delete: if hasPermission('canva.project');
    }

    match /mediaLibrary/{mediaId} {`,
  'biblioteca Canva persistente en Firestore'
);

const internalCanva = String.raw`import React from 'react';

const InternalScreenCanva = ({ state, label = 'Presentación Canva' }) => {
  if (!state?.active || !state?.embedUrl) return null;

  return (
    <div className="fixed inset-0 z-[85] h-[100dvh] w-screen overflow-hidden bg-black">
      <iframe
        key={state.embedUrl}
        src={state.embedUrl}
        title={state.title || label}
        className="h-full w-full border-0 bg-black"
        allow="fullscreen"
        allowFullScreen
        loading="eager"
      />
    </div>
  );
};

export default InternalScreenCanva;
`;

assertIncludes(controller, [
  'canvaPresentations',
  'defaultTargets',
  'canvaOutputs: nextOutputs',
  'Proyectar en seleccionadas',
  'sm:grid-cols-5',
], 'controller');
assertIncludes(projector, ['InternalScreenCanva', 'canvaOutputs?.projector'], 'projector');
assertIncludes(singers, ['InternalScreenCanva', 'canvaOutputs?.singers'], 'cantantes');
assertIncludes(musicians, ['InternalScreenCanva', 'canvaOutputs?.musicians'], 'musicos');
assertIncludes(rules, ['canUpdateEventCanvaOutputs', 'match /canvaPresentations/{presentationId}'], 'rules');

const snapshots = new Map();
for (const path of [files.controller, files.projector, files.singers, files.musicians, files.rules, files.internalCanva]) {
  snapshots.set(path, fs.existsSync(path) ? fs.readFileSync(path) : null);
}

try {
  writeNormalized(files.controller, controller, controllerFile.eol);
  writeNormalized(files.projector, projector, projectorFile.eol);
  writeNormalized(files.singers, singers, singersFile.eol);
  writeNormalized(files.musicians, musicians, musiciansFile.eol);
  writeNormalized(files.rules, rules, rulesFile.eol);
  fs.writeFileSync(files.internalCanva, internalCanva, 'utf8');

  console.log('Canva Biblioteca + destinos aplicada: persistencia, salidas independientes y UI móvil.');
} catch (error) {
  for (const [path, bytes] of snapshots.entries()) {
    if (bytes === null) {
      try { fs.unlinkSync(path); } catch {}
    } else {
      fs.writeFileSync(path, bytes);
    }
  }
  throw error;
}
