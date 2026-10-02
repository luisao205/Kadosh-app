import fs from 'node:fs';

const files = {
  controller: 'src/components/live/ProyectorController.jsx',
  projector: 'src/components/live/Proyector.jsx',
  singers: 'src/components/live/StageDisplayCantantes.jsx',
  musicians: 'src/components/live/StageDisplayMusicos.jsx',
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

const replaceAllCounted = (source, needle, replacement, label, expectedCount) => {
  if (source.includes(replacement) && !source.includes(needle)) {
    console.log('[skip] ' + label + ': ya aplicado.');
    return source;
  }
  const count = source.split(needle).length - 1;
  if (count !== expectedCount) throw new Error('Cantidad inesperada para ' + label + ': ' + count + ' (esperado ' + expectedCount + ').');
  console.log('[ok] ' + label + ': ' + count + ' reemplazo(s)');
  return source.split(needle).join(replacement);
};

const snapshots = Object.fromEntries(
  Object.entries(files).map(([key, path]) => [key, { path, ...readNormalized(path) }])
);

let controller = snapshots.controller.text;
let projector = snapshots.projector.text;
let singers = snapshots.singers.text;
let musicians = snapshots.musicians.text;
let rules = snapshots.rules.text;

// -----------------------------------------------------------------------------
// 1) Controlador: destinos independientes de Multimedia.
// -----------------------------------------------------------------------------
controller = replaceOnce(
  controller,
  `  const [canvaTargets, setCanvaTargets] = useState({ projector: true, singers: false, musicians: false });\n  const [isSavingCanva, setIsSavingCanva] = useState(false);`,
  `  const [canvaTargets, setCanvaTargets] = useState({ projector: true, singers: false, musicians: false });\n  const [mediaTargets, setMediaTargets] = useState({ projector: true, singers: false, musicians: false });\n  const [isSavingCanva, setIsSavingCanva] = useState(false);`,
  'estado de destinos Multimedia'
);

const mediaRoutingHelpers = String.raw`
  const normalizeMediaTargets = (targets) => ({
    projector: targets?.projector === true,
    singers: targets?.singers === true,
    musicians: targets?.musicians === true,
  });

  const hasMediaTargets = (targets) => Object.values(normalizeMediaTargets(targets)).some(Boolean);

  const getMediaRouteKey = (media = {}) => String(
    media?.mediaKey || media?.mediaId || media?.id || media?.url || ''
  ).trim();

  const buildRoutedMediaState = (media = {}) => {
    const url = String(media?.url || '').trim();
    if (!url) return null;
    return {
      active: true,
      mediaKey: getMediaRouteKey(media) || url,
      mediaId: String(media?.mediaId || media?.id || ''),
      name: String(media?.name || media?.title || 'Multimedia'),
      url,
      type: String(media?.type || (isVideoMediaUrl(url) ? 'video' : 'image')),
      mode: 'foreground',
      playing: media?.playing !== false,
      volume: Number.isFinite(Number(media?.volume)) ? Math.max(0, Math.min(1, Number(media.volume))) : 1,
      loop: media?.loop !== false,
      updatedAt: Date.now(),
      updatedBy: user?.nombre || user?.email || 'Multimedia',
    };
  };

  const getLatestRoutedMedia = (mediaOutputs) => {
    if (!mediaOutputs || typeof mediaOutputs !== 'object') return null;
    return ['projector', 'singers', 'musicians']
      .map((targetId) => mediaOutputs[targetId])
      .filter((state) => state?.active && state?.url)
      .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))[0] || null;
  };

  const selectVaultMedia = (media) => {
    if (!media?.url) return;
    const nextPreview = {
      ...media,
      url: media.url,
      type: media.type || (isVideoMediaUrl(media.url) ? 'video' : 'image'),
      mode: 'foreground',
      name: media.name || media.title || 'Multimedia',
    };
    setPreviewMedia(nextPreview);
    if (typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches) {
      setLargePreview(nextPreview);
    }
  };

`;

controller = replaceOnce(
  controller,
  `  const hasTargets = (targets) => Object.values(normalizeCanvaTargets(targets)).some(Boolean);\n\n  const clearLegacyCanvaProjection = async () => {`,
  `  const hasTargets = (targets) => Object.values(normalizeCanvaTargets(targets)).some(Boolean);\n${mediaRoutingHelpers}  const clearLegacyCanvaProjection = async () => {`,
  'helpers de ruteo Multimedia'
);

// Canva toma control de sus destinos y retira Multimedia solo allí.
controller = replaceOnce(
  controller,
  `      const data = snapshot.data();\n      const nextOutputs = { ...(data.canvaOutputs || {}) };\n\n      ['projector', 'singers', 'musicians'].forEach((targetId) => {\n        if (safeTargets[targetId]) {\n          nextOutputs[targetId] = outputState;\n          return;\n        }`,
  `      const data = snapshot.data();\n      const nextOutputs = { ...(data.canvaOutputs || {}) };\n      const nextMediaOutputs = { ...(data.mediaOutputs || {}) };\n\n      ['projector', 'singers', 'musicians'].forEach((targetId) => {\n        if (safeTargets[targetId]) {\n          nextOutputs[targetId] = outputState;\n          delete nextMediaOutputs[targetId];\n          return;\n        }`,
  'Canva retira Multimedia solo en destinos seleccionados'
);

controller = replaceOnce(
  controller,
  `      transaction.update(eventRef, { canvaOutputs: nextOutputs });\n    });\n  };\n\n  const projectCanva = async () => {`,
  `      transaction.update(eventRef, { canvaOutputs: nextOutputs, mediaOutputs: nextMediaOutputs });\n    });\n  };\n\n  const projectCanva = async () => {`,
  'handoff Canva a Multimedia por destino'
);

controller = replaceOnce(
  controller,
  `        setModoTransmision(data.proyectorModoTransmision ?? false);\n        setIsLogoActive(data.proyectorLogo ?? false);\n        setMediaActive(data.proyectorMedia || null);`,
  `        setModoTransmision(data.proyectorModoTransmision ?? false);\n        setIsLogoActive(data.proyectorLogo ?? false);\n        const hasRoutedMedia = data.mediaOutputs && typeof data.mediaOutputs === 'object';\n        setMediaActive(hasRoutedMedia ? getLatestRoutedMedia(data.mediaOutputs) : (data.proyectorMedia || null));`,
  'media activa desde salida ruteada más reciente'
);

controller = replaceOnce(
  controller,
  `    setPreviewMedia(null);\n    setBiblePreview(null);`,
  `    setPreviewMedia(null);\n    setMediaTargets({ projector: true, singers: false, musicians: false });\n    setBiblePreview(null);`,
  'reiniciar destinos Multimedia por evento'
);

controller = replaceAllCounted(
  controller,
  `        canvaOutputs: {},\n        announcementState: buildInactiveAnnouncementState(),`,
  `        canvaOutputs: {},\n        mediaOutputs: {},\n        announcementState: buildInactiveAnnouncementState(),`,
  'Predica/Biblia toman control de Multimedia',
  3
);

controller = replaceOnce(
  controller,
  `    const updates = {\n      canvaOutputs: {},\n      announcementState: buildInactiveAnnouncementState(),`,
  `    const updates = {\n      canvaOutputs: {},\n      mediaOutputs: {},\n      announcementState: buildInactiveAnnouncementState(),`,
  'Canciones toman control de Multimedia'
);

const oldProjectMedia = `  const projectMedia = async (mediaObj) => {\n    if (!mediaObj) return;\n    rememberUndoSnapshot();\n    const updates = buildProjectorMediaPayload({\n      media: mediaObj,\n      title: mediaObj.name || mediaObj.title || 'Media',\n      timer: evento?.proyectorCountdown || null,\n      liveState: buildInactiveSongLiveState('media', mediaObj.name || mediaObj.title || 'Multimedia')\n    });\n    updates.proyectorFondo = null;\n    updates.proyectorFondoMedia = null;\n    updates.canvaOutputs = {};\n    try { await enqueueProjectionWrite(() => updateDoc(doc(db, 'eventos', eventoId), updates)); }\n    catch (e) { console.error(e); }\n  };`;

const newProjectMedia = `  const projectMedia = async (mediaObj) => {\n    if (!mediaObj?.url) return;\n    const safeTargets = normalizeMediaTargets(mediaTargets);\n    if (!hasMediaTargets(safeTargets)) {\n      notify('Selecciona al menos un destino para Multimedia.', { type: 'error' });\n      return;\n    }\n\n    const outputState = buildRoutedMediaState(mediaObj);\n    if (!outputState) return;\n    const eventRef = doc(db, 'eventos', eventoId);\n\n    try {\n      await enqueueProjectionWrite(() => runTransaction(db, async (transaction) => {\n        const snapshot = await transaction.get(eventRef);\n        if (!snapshot.exists()) throw new Error('El evento ya no existe.');\n        const data = snapshot.data();\n        const nextMediaOutputs = { ...(data.mediaOutputs || {}) };\n        const nextCanvaOutputs = { ...(data.canvaOutputs || {}) };\n\n        ['projector', 'singers', 'musicians'].forEach((targetId) => {\n          if (safeTargets[targetId]) {\n            nextMediaOutputs[targetId] = outputState;\n            delete nextCanvaOutputs[targetId];\n            return;\n          }\n\n          const existing = nextMediaOutputs[targetId];\n          if (existing?.mediaKey === outputState.mediaKey) delete nextMediaOutputs[targetId];\n        });\n\n        transaction.update(eventRef, {\n          mediaOutputs: nextMediaOutputs,\n          canvaOutputs: nextCanvaOutputs,\n        });\n      }));\n      setMediaActive(outputState);\n      notify('Multimedia enviada a las pantallas seleccionadas.', { type: 'success' });\n    } catch (error) {\n      console.error('Error proyectando Multimedia por destinos:', error);\n      notify('No se pudo proyectar Multimedia en los destinos seleccionados.', { type: 'error' });\n    }\n  };`;

controller = replaceOnce(controller, oldProjectMedia, newProjectMedia, 'ruteo independiente al proyectar Multimedia');

const oldMediaControls = `  const handleMediaControl = async (updates) => { // Esta función ya estaba bien\n    try {\n      const newMedia = { ...mediaActive, ...updates };\n      await setDoc(doc(db, 'eventos', eventoId), { proyectorMedia: newMedia }, { merge: true });\n    } catch (e) { console.error(e); }\n  };\n\n  const handleSeekCommand = async (type) => { // Esta función ya estaba bien\n    if (!mediaActive) return;\n    try {\n      await setDoc(doc(db, 'eventos', eventoId), { proyectorMedia: { ...mediaActive, seekRequest: { type, time: Date.now() } } }, { merge: true });\n    } catch (e) { console.error(e); }\n  };\n\n  const detenerMedia = async () => {\n    rememberUndoSnapshot();\n    try {\n      const updates = buildStoppedProjectorMediaPayload({\n        eventData: evento,\n        liveState: buildInactiveSongLiveState('none', 'Sin contenido activo')\n      });\n      await enqueueProjectionWrite(() => updateDoc(doc(db, 'eventos', eventoId), updates));\n      setPreviewMedia(null); // Limpiar también la vista previa local al detener\n    } catch (error) {\n      console.error('Error deteniendo multimedia:', error);\n      notify('No se pudo detener la multimedia.', { type: 'error' });\n    }\n  };`;

const newMediaControls = `  const updateRoutedMedia = async (mutate) => {\n    const activeKey = getMediaRouteKey(mediaActive);\n    const routedOutputs = evento?.mediaOutputs;\n    if (!activeKey || !routedOutputs || typeof routedOutputs !== 'object') return false;\n\n    let nextActive = null;\n    let changed = 0;\n    const eventRef = doc(db, 'eventos', eventoId);\n    await enqueueProjectionWrite(() => runTransaction(db, async (transaction) => {\n      const snapshot = await transaction.get(eventRef);\n      if (!snapshot.exists()) throw new Error('El evento ya no existe.');\n      const nextOutputs = { ...(snapshot.data().mediaOutputs || {}) };\n      const now = Date.now();\n\n      ['projector', 'singers', 'musicians'].forEach((targetId) => {\n        const existing = nextOutputs[targetId];\n        if (!existing?.active || getMediaRouteKey(existing) !== activeKey) return;\n        const mutated = mutate(existing, now);\n        if (mutated == null) delete nextOutputs[targetId];\n        else {\n          nextOutputs[targetId] = mutated;\n          if (!nextActive) nextActive = mutated;\n        }\n        changed += 1;\n      });\n\n      if (changed > 0) transaction.update(eventRef, { mediaOutputs: nextOutputs });\n    }));\n\n    if (changed > 0) setMediaActive(nextActive);\n    return changed > 0;\n  };\n\n  const handleMediaControl = async (updates) => {\n    if (!mediaActive) return;\n    try {\n      const routed = await updateRoutedMedia((existing, now) => ({\n        ...existing,\n        ...updates,\n        updatedAt: now,\n        updatedBy: user?.nombre || user?.email || 'Multimedia',\n      }));\n      if (!routed) {\n        const newMedia = { ...mediaActive, ...updates };\n        await setDoc(doc(db, 'eventos', eventoId), { proyectorMedia: newMedia }, { merge: true });\n      }\n    } catch (e) { console.error(e); }\n  };\n\n  const handleSeekCommand = async (type) => {\n    if (!mediaActive) return;\n    try {\n      const seekRequest = { type, time: Date.now() };\n      const routed = await updateRoutedMedia((existing, now) => ({\n        ...existing,\n        seekRequest,\n        updatedAt: now,\n        updatedBy: user?.nombre || user?.email || 'Multimedia',\n      }));\n      if (!routed) {\n        await setDoc(doc(db, 'eventos', eventoId), { proyectorMedia: { ...mediaActive, seekRequest } }, { merge: true });\n      }\n    } catch (e) { console.error(e); }\n  };\n\n  const detenerMedia = async () => {\n    try {\n      const routed = await updateRoutedMedia(() => null);\n      if (!routed) {\n        rememberUndoSnapshot();\n        const updates = buildStoppedProjectorMediaPayload({\n          eventData: evento,\n          liveState: buildInactiveSongLiveState('none', 'Sin contenido activo')\n        });\n        await enqueueProjectionWrite(() => updateDoc(doc(db, 'eventos', eventoId), updates));\n      }\n      setPreviewMedia(null);\n      notify('Multimedia retirada.', { type: 'success' });\n    } catch (error) {\n      console.error('Error deteniendo multimedia:', error);\n      notify('No se pudo detener la multimedia.', { type: 'error' });\n    }\n  };`;

controller = replaceOnce(controller, oldMediaControls, newMediaControls, 'controles de video sincronizados por destino');

const mediaTargetSelector = String.raw`
  const renderMediaTargetSelector = ({ compact = false } = {}) => {
    const safeTargets = normalizeMediaTargets(mediaTargets);
    const options = [
      ['projector', 'Proyector', Monitor],
      ['singers', 'Cantantes', Type],
      ['musicians', 'Músicos', Music],
    ];
    return (
      <div className={compact ? 'rounded-2xl border border-white/10 bg-black/30 p-2.5' : 'rounded-2xl border border-violet-400/20 bg-violet-500/8 p-3'}>
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-[9px] font-black uppercase tracking-[0.18em] text-violet-200">Destinos Multimedia</p>
          <span className="text-[9px] font-bold text-zinc-500">Selecciona dónde se muestra</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {options.map(([targetId, label, Icon]) => {
            const active = safeTargets[targetId];
            return (
              <button
                key={targetId}
                type="button"
                aria-pressed={active}
                onClick={() => setMediaTargets((current) => ({ ...current, [targetId]: !current[targetId] }))}
                className={'min-h-11 rounded-xl border px-2 py-2 text-[9px] font-black uppercase transition-all ' + (active
                  ? 'border-cyan-200 bg-cyan-400 text-zinc-950 shadow-lg shadow-cyan-500/10'
                  : 'border-white/10 bg-white/5 text-zinc-300 hover:border-violet-400/30 hover:bg-violet-500/10')}
              >
                <span className="flex items-center justify-center gap-1.5"><Icon size={13} /> {label}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

`;

controller = replaceOnce(
  controller,
  `  // Filtrar archivos para el buscador\n  const filteredMedia = multimediaLib.filter(m => {`,
  mediaTargetSelector + `  // Filtrar archivos para el buscador\n  const filteredMedia = multimediaLib.filter(m => {`,
  'selector visual de destinos Multimedia'
);

// Vista previa real del Proyector: no confundir con una media enviada solo a tarima.
controller = replaceOnce(
  controller,
  `  const previewSectionMedia = Array.isArray(previewSlide?.media) ? previewSlide.media.find(resource => resource?.url) : null;`,
  `  const projectorPreviewMedia = evento?.mediaOutputs && typeof evento.mediaOutputs === 'object'\n    ? (evento.mediaOutputs?.projector?.active ? evento.mediaOutputs.projector : null)\n    : mediaActive;\n  const previewSectionMedia = Array.isArray(previewSlide?.media) ? previewSlide.media.find(resource => resource?.url) : null;`,
  'media real del Proyector en vista En Vivo'
);

controller = replaceOnce(
  controller,
  `    const state = evento?.projectorState;\n    if (state?.type === 'preaching') {`,
  `    const state = evento?.projectorState;\n    const routedProjectorMedia = evento?.mediaOutputs?.projector?.active ? evento.mediaOutputs.projector : null;\n    if (routedProjectorMedia?.url) {\n      return { label: \`Multimedia · \${routedProjectorMedia.name || 'Recurso'}\`, actor: routedProjectorMedia.updatedBy || 'Multimedia' };\n    }\n    if (state?.type === 'preaching') {`,
  'estado superior refleja Multimedia del Proyector'
);

controller = replaceOnce(
  controller,
  `  }, [evento?.projectorState, isBlackout, isLogoActive, liveSlide, mediaActive]);`,
  `  }, [evento?.projectorState, evento?.mediaOutputs?.projector, isBlackout, isLogoActive, liveSlide, mediaActive]);`,
  'dependencia de estado superior Multimedia'
);

controller = replaceOnce(
  controller,
  `                ) : displayLiveSlide ? (`,
  `                ) : displayLiveSlide && !projectorPreviewMedia?.url ? (`,
  'Multimedia ruteada domina preview En Vivo'
);

controller = replaceOnce(
  controller,
  `                ) : mediaActive?.url ? ( // MULTIMEDIA EN VIVO\n                  <div className="flex flex-col items-center gap-3 animate-in fade-in zoom-in-95 duration-300">\n                    <div className="absolute inset-0 z-0 opacity-40">\n                       {mediaActive.type === 'video' ? <video src={mediaActive.url} autoPlay loop muted playsInline className="w-full h-full object-contain" /> : <img src={mediaActive.url} className="w-full h-full object-contain" />}\n                    </div>\n                    <div className="relative z-10 text-center px-4 flex flex-col items-center justify-center h-full">\n                      <p className="text-indigo-400 font-black text-[11px] uppercase tracking-[0.2em] mb-1">\n                        {mediaActive.type === 'video' ? 'Proyectando Video' : 'Proyectando Imagen'}\n                      </p>\n                      <p className="text-white text-xs font-bold truncate max-w-[200px] mb-6 italic bg-black/50 px-3 py-1 rounded-full">\"{mediaActive.name || 'Archivo'}\"</p>`,
  `                ) : projectorPreviewMedia?.url ? ( // MULTIMEDIA EN VIVO EN PROYECTOR\n                  <div className="flex flex-col items-center gap-3 animate-in fade-in zoom-in-95 duration-300">\n                    <div className="absolute inset-0 z-0 opacity-40">\n                       {projectorPreviewMedia.type === 'video' ? <video src={projectorPreviewMedia.url} autoPlay loop muted playsInline className="w-full h-full object-contain" /> : <img src={projectorPreviewMedia.url} className="w-full h-full object-contain" />}\n                    </div>\n                    <div className="relative z-10 text-center px-4 flex flex-col items-center justify-center h-full">\n                      <p className="text-indigo-400 font-black text-[11px] uppercase tracking-[0.2em] mb-1">\n                        {projectorPreviewMedia.type === 'video' ? 'Proyectando Video' : 'Proyectando Imagen'}\n                      </p>\n                      <p className="text-white text-xs font-bold truncate max-w-[200px] mb-6 italic bg-black/50 px-3 py-1 rounded-full">\"{projectorPreviewMedia.name || 'Archivo'}\"</p>`,
  'preview En Vivo usa solo media del Proyector'
);

// Desktop: todo clic de media abre preview grande.
controller = replaceOnce(
  controller,
  `                      onClick={() => setPreviewMedia({ url: m.url, type: m.type, mode: 'foreground', name: m.name })}\n                      className={\`w-24 h-16 rounded-2xl overflow-hidden border transition-all bg-black relative \${previewMedia?.url === m.url ? 'border-indigo-500 ring-2 ring-indigo-500/30' : 'border-white/10 hover:border-indigo-400'}\`}`,
  `                      onClick={() => selectVaultMedia(m)}\n                      className={\`w-24 h-16 rounded-2xl overflow-hidden border transition-all bg-black relative \${previewMedia?.url === m.url ? 'border-indigo-500 ring-2 ring-indigo-500/30' : 'border-white/10 hover:border-indigo-400'}\`}`,
  'clic desktop abre vista previa grande'
);

controller = replaceOnce(
  controller,
  `                      className="absolute bottom-1 left-1 p-1 bg-zinc-900/80 text-zinc-300 rounded-md opacity-0 group-hover:opacity-100 transition-all border border-white/10"`,
  `                      className="absolute bottom-1 left-1 hidden lg:block p-1 bg-zinc-900/80 text-zinc-300 rounded-md opacity-0 group-hover:opacity-100 transition-all border border-white/10"`,
  'lupa grande solo en pantallas grandes'
);

controller = replaceOnce(
  controller,
  `              {projectionSourceMode === 'media' && (\n                <button\n                  onClick={() => projectMedia(previewMedia)}\n                  disabled={!previewMedia}\n                  className="mt-4 py-3.5 bg-violet-600 hover:bg-violet-500 text-white rounded-2xl font-black text-sm uppercase tracking-wide flex items-center justify-center gap-2 disabled:opacity-40 disabled:grayscale transition-all active:scale-95 shadow-lg shadow-violet-900/20"\n                >\n                  <Monitor size={18} /> Proyectar Contenido\n                </button>\n              )}`,
  `              {projectionSourceMode === 'media' && (\n                <div className="mt-4 space-y-3">\n                  {renderMediaTargetSelector()}\n                  <button\n                    onClick={() => projectMedia(previewMedia)}\n                    disabled={!previewMedia || !hasMediaTargets(mediaTargets)}\n                    className="w-full py-3.5 bg-violet-600 hover:bg-violet-500 text-white rounded-2xl font-black text-sm uppercase tracking-wide flex items-center justify-center gap-2 disabled:opacity-40 disabled:grayscale transition-all active:scale-95 shadow-lg shadow-violet-900/20"\n                  >\n                    <Monitor size={18} /> Proyectar en seleccionadas\n                  </button>\n                </div>\n              )}`,
  'destinos junto a Proyectar Multimedia'
);

controller = replaceOnce(
  controller,
  `            {previewMedia && (\n              <button onClick={() => projectMedia(previewMedia)} className="w-full rounded-2xl bg-violet-600 py-3 text-xs font-black uppercase text-white shadow-lg shadow-violet-950/30">\n                Proyectar multimedia\n              </button>\n            )}`,
  `            {previewMedia && (\n              <div className="space-y-2">\n                {renderMediaTargetSelector({ compact: true })}\n                <button disabled={!hasMediaTargets(mediaTargets)} onClick={() => projectMedia(previewMedia)} className="w-full rounded-2xl bg-violet-600 py-3 text-xs font-black uppercase text-white shadow-lg shadow-violet-950/30 disabled:opacity-40">\n                  Proyectar en seleccionadas\n                </button>\n              </div>\n            )}`,
  'destinos Multimedia en panel móvil'
);

controller = replaceOnce(
  controller,
  `                    <button onClick={() => { projectMedia(previewMedia); setShowMobileControlsModal(false); }} className="w-full py-3 bg-violet-600 text-white rounded-2xl font-black text-xs uppercase shadow-lg">🚀 PROYECTAR AHORA</button>`,
  `                    <div className="mb-3">{renderMediaTargetSelector({ compact: true })}</div>\n                    <button disabled={!hasMediaTargets(mediaTargets)} onClick={() => { projectMedia(previewMedia); setShowMobileControlsModal(false); }} className="w-full py-3 bg-violet-600 text-white rounded-2xl font-black text-xs uppercase shadow-lg disabled:opacity-40">🚀 PROYECTAR EN SELECCIONADAS</button>`,
  'destinos Multimedia en hoja móvil'
);

controller = replaceOnce(
  controller,
  `            <button \n              onClick={() => { projectMedia(largePreview); setLargePreview(null); }}\n              className="absolute -top-12 left-0 p-2 bg-violet-600 text-white hover:bg-violet-500 rounded-xl px-6 font-black flex items-center gap-2 shadow-lg transition-all active:scale-95"\n            >\n              <Send size={18}/> PROYECTAR AHORA\n            </button> {/* Botón para proyectar directamente desde la vista previa grande */}\n\n            <div className="w-full aspect-video bg-zinc-900 rounded-3xl overflow-hidden border border-white/10 shadow-2xl">`,
  `            <button \n              disabled={!hasMediaTargets(mediaTargets)}\n              onClick={() => { projectMedia(largePreview); setLargePreview(null); }}\n              className="absolute -top-12 left-0 p-2 bg-violet-600 text-white hover:bg-violet-500 rounded-xl px-6 font-black flex items-center gap-2 shadow-lg transition-all active:scale-95 disabled:opacity-40"\n            >\n              <Send size={18}/> PROYECTAR EN SELECCIONADAS\n            </button>\n\n            <div className="mb-3 w-full">{renderMediaTargetSelector()}</div>\n            <div className="w-full aspect-video bg-zinc-900 rounded-3xl overflow-hidden border border-white/10 shadow-2xl">`,
  'destinos dentro de vista previa grande'
);

// -----------------------------------------------------------------------------
// 2) Salidas: cada categoría lee su mediaOutput independiente.
// -----------------------------------------------------------------------------
projector = replaceOnce(
  projector,
  `  const [canvaOutput, setCanvaOutput] = useState(null);\n  const [showControls, setShowControls] = useState(false);`,
  `  const [canvaOutput, setCanvaOutput] = useState(null);\n  const [hasRoutedMedia, setHasRoutedMedia] = useState(false);\n  const [showControls, setShowControls] = useState(false);`,
  'estado de ruteo Multimedia en Proyector'
);

projector = replaceOnce(
  projector,
  `        setSlide(data.proyectorSlide || null);\n        setMedia(data.proyectorMedia || null);\n        setApagar(data.proyectorApagado || false);`,
  `        setSlide(data.proyectorSlide || null);\n        const routedMedia = data.mediaOutputs?.projector;\n        const routedMediaEnabled = Boolean(data.mediaOutputs && typeof data.mediaOutputs === 'object');\n        setHasRoutedMedia(routedMediaEnabled);\n        setMedia(routedMediaEnabled ? (routedMedia?.active ? routedMedia : null) : (data.proyectorMedia || null));\n        setApagar(data.proyectorApagado || false);`,
  'Proyector consume mediaOutputs.projector'
);

projector = replaceOnce(
  projector,
  `        <div key={media.url} className="absolute inset-0 z-40 bg-black animate-in fade-in duration-500 overflow-hidden block">`,
  `        <div key={media.url} className={\`absolute inset-0 \${hasRoutedMedia ? 'z-[80]' : 'z-40'} bg-black animate-in fade-in duration-500 overflow-hidden block\`}>`,
  'Multimedia ruteada domina contenido subyacente en Proyector'
);

singers = replaceOnce(
  singers,
  `      const isProjectedMedia = !data.proyectorApagado && (\n        data.projectorState?.type === 'media'\n        || ['media', 'preaching-media'].includes(nextLiveState.activeContentType)\n      );\n      setMedia(isProjectedMedia ? (data.proyectorMedia || null) : null);`,
  `      const routedMediaEnabled = Boolean(data.mediaOutputs && typeof data.mediaOutputs === 'object');\n      const routedMedia = data.mediaOutputs?.singers;\n      const isProjectedMedia = !data.proyectorApagado && (\n        data.projectorState?.type === 'media'\n        || ['media', 'preaching-media'].includes(nextLiveState.activeContentType)\n      );\n      setMedia(routedMediaEnabled ? (routedMedia?.active ? routedMedia : null) : (isProjectedMedia ? (data.proyectorMedia || null) : null));`,
  'Cantantes consume mediaOutputs.singers'
);

musicians = replaceOnce(
  musicians,
  `      const isProjectedMedia = !data.proyectorApagado && (\n        data.projectorState?.type === 'media'\n        || ['media', 'preaching-media'].includes(nextLiveState.activeContentType)\n      );\n      setMedia(isProjectedMedia ? (data.proyectorMedia || null) : null);`,
  `      const routedMediaEnabled = Boolean(data.mediaOutputs && typeof data.mediaOutputs === 'object');\n      const routedMedia = data.mediaOutputs?.musicians;\n      const isProjectedMedia = !data.proyectorApagado && (\n        data.projectorState?.type === 'media'\n        || ['media', 'preaching-media'].includes(nextLiveState.activeContentType)\n      );\n      setMedia(routedMediaEnabled ? (routedMedia?.active ? routedMedia : null) : (isProjectedMedia ? (data.proyectorMedia || null) : null));`,
  'Músicos consume mediaOutputs.musicians'
);

// -----------------------------------------------------------------------------
// 3) Firestore: mediaOutputs + handoff seguro Canva <-> Multimedia.
// -----------------------------------------------------------------------------
rules = replaceOnce(
  rules,
  `        'proyectorTicker',\n        'outputs',\n        'canvaOutputs',\n        'announcementState'`,
  `        'proyectorTicker',\n        'outputs',\n        'canvaOutputs',\n        'mediaOutputs',\n        'announcementState'`,
  'mediaOutputs en projectorEventFields'
);

rules = replaceOnce(
  rules,
  `        'proyectorNextSlide', 'proyectorNextSong', 'proyectorOffset', 'liveState', 'currentSongId', 'canvaOutputs', 'announcementState'];`,
  `        'proyectorNextSlide', 'proyectorNextSong', 'proyectorOffset', 'liveState', 'currentSongId', 'canvaOutputs', 'mediaOutputs', 'announcementState'];`,
  'mediaOutputs en bibleProjectionFields'
);

rules = replaceOnce(
  rules,
  `        && (\n          !changedEventKeys().hasAny(['canvaOutputs'])\n          || (request.resource.data.canvaOutputs is map && request.resource.data.canvaOutputs.keys().size() == 0)\n        )\n        && (\n          !changedEventKeys().hasAny(['announcementState'])`,
  `        && (\n          !changedEventKeys().hasAny(['canvaOutputs'])\n          || (request.resource.data.canvaOutputs is map && request.resource.data.canvaOutputs.keys().size() == 0)\n        )\n        && (\n          !changedEventKeys().hasAny(['mediaOutputs'])\n          || (request.resource.data.mediaOutputs is map && request.resource.data.mediaOutputs.keys().size() == 0)\n        )\n        && (\n          !changedEventKeys().hasAny(['announcementState'])`,
  'proyecciones globales solo pueden limpiar mediaOutputs'
);

const mediaRules = String.raw`
    function validMediaOutputState(state) {
      return state is map
        && state.keys().hasOnly([
          'active', 'mediaKey', 'mediaId', 'name', 'url', 'type', 'mode',
          'playing', 'volume', 'loop', 'seekRequest', 'updatedAt', 'updatedBy'
        ])
        && state.active == true
        && state.mediaKey is string
        && state.mediaKey != ''
        && state.mediaId is string
        && state.name is string
        && state.url is string
        && state.url != ''
        && state.type is string
        && state.mode == 'foreground'
        && state.playing is bool
        && (state.volume is int || state.volume is float)
        && state.volume >= 0
        && state.volume <= 1
        && state.loop is bool
        && (!('seekRequest' in state) || (
          state.seekRequest is map
          && state.seekRequest.keys().hasOnly(['type', 'time'])
          && state.seekRequest.type in ['start', 'back10', 'fwd10']
          && state.seekRequest.time is int
        ))
        && state.updatedAt is int
        && state.updatedBy is string;
    }

    function validMediaOutputsMap() {
      let outputs = request.resource.data.mediaOutputs;
      return outputs is map
        && outputs.keys().hasOnly(['projector', 'singers', 'musicians'])
        && (!('projector' in outputs) || validMediaOutputState(outputs.projector))
        && (!('singers' in outputs) || validMediaOutputState(outputs.singers))
        && (!('musicians' in outputs) || validMediaOutputState(outputs.musicians));
    }

    function mediaOutputsOnlyRemove() {
      let next = request.resource.data.mediaOutputs;
      let previous = ('mediaOutputs' in resource.data && resource.data.mediaOutputs is map)
        ? resource.data.mediaOutputs
        : {};
      return next is map
        && next.keys().hasOnly(['projector', 'singers', 'musicians'])
        && (!('projector' in next) || ('projector' in previous && next.projector == previous.projector))
        && (!('singers' in next) || ('singers' in previous && next.singers == previous.singers))
        && (!('musicians' in next) || ('musicians' in previous && next.musicians == previous.musicians));
    }

    function canvaOutputsOnlyRemove() {
      let next = request.resource.data.canvaOutputs;
      let previous = ('canvaOutputs' in resource.data && resource.data.canvaOutputs is map)
        ? resource.data.canvaOutputs
        : {};
      return next is map
        && next.keys().hasOnly(['projector', 'singers', 'musicians'])
        && (!('projector' in next) || ('projector' in previous && next.projector == previous.projector))
        && (!('singers' in next) || ('singers' in previous && next.singers == previous.singers))
        && (!('musicians' in next) || ('musicians' in previous && next.musicians == previous.musicians));
    }

    function canUpdateEventMediaOutputs() {
      return hasPermission('multimedia.project')
        && onlyEventKeys(['mediaOutputs', 'canvaOutputs'])
        && validMediaOutputsMap()
        && (
          !changedEventKeys().hasAny(['canvaOutputs'])
          || (validCanvaOutputsMap() && canvaOutputsOnlyRemove())
        );
    }

`;

rules = replaceOnce(
  rules,
  `    function validCanvaOutputState(state) {`,
  mediaRules + `    function validCanvaOutputState(state) {`,
  'validación y permiso mediaOutputs'
);

rules = replaceOnce(
  rules,
  `    function canUpdateEventCanvaOutputs() {\n      return hasPermission('canva.project')\n        && onlyEventKeys(['canvaOutputs'])\n        && validCanvaOutputsMap();\n    }`,
  `    function canUpdateEventCanvaOutputs() {\n      return hasPermission('canva.project')\n        && onlyEventKeys(['canvaOutputs', 'mediaOutputs'])\n        && validCanvaOutputsMap()\n        && (\n          !changedEventKeys().hasAny(['mediaOutputs'])\n          || (validMediaOutputsMap() && mediaOutputsOnlyRemove())\n        );\n    }`,
  'Canva puede retirar Multimedia solo de sus destinos'
);

rules = replaceOnce(
  rules,
  `          || canUpdateEventBibleOutline()\n          || canUpdateEventCanvaOutputs()\n          || canUpdateEventAsParticipant()`,
  `          || canUpdateEventBibleOutline()\n          || canUpdateEventCanvaOutputs()\n          || canUpdateEventMediaOutputs()\n          || canUpdateEventAsParticipant()`,
  'ruta dedicada mediaOutputs'
);

const validations = [
  [controller, `const [mediaTargets, setMediaTargets]`, 'estado mediaTargets'],
  [controller, `mediaOutputs: nextMediaOutputs`, 'ruteo Multimedia'],
  [controller, `selectVaultMedia(m)`, 'preview grande desktop'],
  [controller, `renderMediaTargetSelector`, 'selector destinos'],
  [controller, `projectorPreviewMedia`, 'preview En Vivo del Proyector'],
  [projector, `data.mediaOutputs?.projector`, 'salida Proyector'],
  [singers, `data.mediaOutputs?.singers`, 'salida Cantantes'],
  [musicians, `data.mediaOutputs?.musicians`, 'salida Músicos'],
  [rules, `function validMediaOutputsMap()`, 'reglas mediaOutputs'],
  [rules, `function canUpdateEventMediaOutputs()`, 'permiso mediaOutputs'],
];
for (const [text, needle, label] of validations) {
  if (!text.includes(needle)) throw new Error('Validación interna falló: ' + label);
}

const nextFiles = { controller, projector, singers, musicians, rules };
try {
  for (const [key, text] of Object.entries(nextFiles)) {
    writeNormalized(snapshots[key].path, text, snapshots[key].eol);
  }
} catch (error) {
  for (const snapshot of Object.values(snapshots)) {
    try { writeNormalized(snapshot.path, snapshot.text, snapshot.eol); } catch {}
  }
  throw error;
}

console.log('Multimedia configurable aplicado: destinos independientes + preview grande desktop + handoff Canva seguro (5 archivos).');
