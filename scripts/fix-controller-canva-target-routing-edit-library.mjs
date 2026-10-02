import fs from 'node:fs';

const target = 'src/components/live/ProyectorController.jsx';
const raw = fs.readFileSync(target, 'utf8');
const eol = raw.includes('\r\n') ? '\r\n' : '\n';
let source = raw.replace(/\r\n/g, '\n');

const replaceBetween = (text, startMarker, endMarker, replacement, label) => {
  const start = text.indexOf(startMarker);
  if (start === -1) throw new Error('No se encontró inicio: ' + label);
  const end = text.indexOf(endMarker, start + startMarker.length);
  if (end === -1) throw new Error('No se encontró fin: ' + label);
  console.log('[ok] ' + label);
  return text.slice(0, start) + replacement + text.slice(end);
};

const replaceOnce = (text, needle, replacement, label) => {
  if (text.includes(replacement)) {
    console.log('[skip] ' + label + ': ya aplicado.');
    return text;
  }
  const index = text.indexOf(needle);
  if (index === -1) throw new Error('No se encontró: ' + label);
  console.log('[ok] ' + label);
  return text.slice(0, index) + replacement + text.slice(index + needle.length);
};

const routingBlock = String.raw`  const normalizeCanvaTargets = (targets) => ({
    projector: targets?.projector === true,
    singers: targets?.singers === true,
    musicians: targets?.musicians === true,
  });

  const hasTargets = (targets) => Object.values(normalizeCanvaTargets(targets)).some(Boolean);

  const clearLegacyCanvaProjection = async () => {
    const currentState = evento?.projectorState;
    if (currentState?.contentType !== 'canva') return;
    await enqueueProjectionWrite(() => updateDoc(doc(db, 'eventos', eventoId), {
      projectorState: currentState.previousProjectorState || null,
    }));
  };

  const applyCanvaTargets = async ({ resolved, title, presentationId = '', targets }) => {
    const safeTargets = normalizeCanvaTargets(targets);
    if (!hasTargets(safeTargets)) throw new Error('Selecciona al menos un destino.');

    // Compatibilidad: retirar el Canva global de la primera implementación para que
    // no siga cubriendo el Proyector cuando ahora usamos salidas independientes.
    await clearLegacyCanvaProjection();

    const eventRef = doc(db, 'eventos', eventoId);
    const now = Date.now();
    const outputState = {
      active: true,
      presentationId: presentationId || '',
      title,
      sourceUrl: resolved.sourceUrl,
      embedUrl: resolved.embedUrl,
      updatedAt: now,
      updatedBy: user?.nombre || user?.email || 'Multimedia',
    };

    await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(eventRef);
      if (!snapshot.exists()) throw new Error('El evento ya no existe.');
      const data = snapshot.data();
      const nextOutputs = { ...(data.canvaOutputs || {}) };

      ['projector', 'singers', 'musicians'].forEach((targetId) => {
        if (safeTargets[targetId]) {
          nextOutputs[targetId] = outputState;
          return;
        }

        // Al cambiar destinos de ESTA misma presentación, retirarla de las pantallas
        // que dejaron de estar seleccionadas, sin tocar otros Canva activos.
        const existing = nextOutputs[targetId];
        const samePresentation = presentationId
          ? existing?.presentationId === presentationId
          : existing?.sourceUrl === resolved.sourceUrl;
        if (samePresentation) delete nextOutputs[targetId];
      });

      transaction.update(eventRef, { canvaOutputs: nextOutputs });
    });
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

    try {
      await applyCanvaTargets({
        resolved,
        title: String(canvaDraft.title || '').trim() || 'Presentación Canva',
        presentationId: selectedCanvaId || '',
        targets: canvaTargets,
      });
      setCanvaPreviewUrl(resolved.embedUrl);
      setCanvaUrlError('');
      notify('Canva enviado a las pantallas seleccionadas.', { type: 'success' });
    } catch (error) {
      console.error('Error proyectando Canva por destinos:', error);
      notify('No se pudo enviar Canva a las pantallas seleccionadas.', { type: 'error' });
    }
  };

  const projectSavedCanva = async (item) => {
    if (!item?.id || !canProjectCanva) return;
    const targets = normalizeCanvaTargets(item.defaultTargets);
    if (!hasTargets(targets)) {
      notify('Esta presentación no tiene destinos guardados.', { type: 'error' });
      return;
    }

    const resolved = {
      inputUrl: item.inputUrl || item.sourceUrl || '',
      sourceUrl: item.sourceUrl || item.inputUrl || '',
      embedUrl: item.embedUrl || '',
    };
    if (!resolved.sourceUrl || !normalizeCanvaEmbedUrl(resolved.embedUrl)) {
      notify('El enlace guardado de esta presentación ya no es válido.', { type: 'error' });
      selectCanvaPresentation(item);
      return;
    }

    setSelectedCanvaId(item.id);
    setCanvaDraft({ title: item.title || 'Presentación Canva', url: item.inputUrl || item.sourceUrl || '' });
    setCanvaPreviewUrl(item.embedUrl || '');
    setCanvaTargets(targets);
    setCanvaUrlError('');

    try {
      await applyCanvaTargets({
        resolved,
        title: item.title || 'Presentación Canva',
        presentationId: item.id,
        targets,
      });
      notify('"' + (item.title || 'Canva') + '" proyectado en sus destinos guardados.', { type: 'success' });
    } catch (error) {
      console.error('Error proyectando Canva guardado:', error);
      notify('No se pudo proyectar la presentación guardada.', { type: 'error' });
    }
  };

  const stopCanvaProjection = async () => {
    const safeTargets = normalizeCanvaTargets(canvaTargets);
    if (!hasTargets(safeTargets)) return;

    try {
      await clearLegacyCanvaProjection();
      const eventRef = doc(db, 'eventos', eventoId);
      await runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(eventRef);
        if (!snapshot.exists()) throw new Error('El evento ya no existe.');
        const data = snapshot.data();
        const nextOutputs = { ...(data.canvaOutputs || {}) };
        ['projector', 'singers', 'musicians'].forEach((targetId) => {
          if (safeTargets[targetId]) delete nextOutputs[targetId];
        });
        transaction.update(eventRef, { canvaOutputs: nextOutputs });
      });
      notify('Canva retirado de los destinos seleccionados.', { type: 'success' });
    } catch (error) {
      console.error('Error retirando Canva por destinos:', error);
      notify('No se pudo retirar Canva de las pantallas seleccionadas.', { type: 'error' });
    }
  };

`;

source = replaceBetween(
  source,
  '  const projectCanva = async () => {',
  '  const publicPreachingBlocks = useMemo(() => {',
  routingBlock,
  'enrutado Canva transaccional y compatibilidad con estado global'
);

source = replaceOnce(
  source,
  `<button type="button" onClick={saveCanvaPresentation} disabled={isSavingCanva} className="min-h-12 rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-3 text-[10px] font-black uppercase tracking-wide text-emerald-100 hover:bg-emerald-500/20 disabled:opacity-50">{isSavingCanva ? <Loader2 size={14} className="mr-2 inline animate-spin" /> : <Star size={14} className="mr-2 inline" />}Guardar presentación</button>`,
  `<button type="button" onClick={saveCanvaPresentation} disabled={isSavingCanva} className="min-h-12 rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-3 text-[10px] font-black uppercase tracking-wide text-emerald-100 hover:bg-emerald-500/20 disabled:opacity-50">{isSavingCanva ? <Loader2 size={14} className="mr-2 inline animate-spin" /> : <Star size={14} className="mr-2 inline" />}{selectedCanvaId ? 'Guardar cambios' : 'Guardar presentación'}</button>`,
  'texto Guardar cambios al editar'
);

source = replaceOnce(
  source,
  `<div className="mt-2 grid grid-cols-2 gap-2">\n                                <button type="button" onClick={() => selectCanvaPresentation(item)} className="min-h-10 rounded-lg border border-white/10 bg-white/5 px-2 text-[9px] font-black uppercase text-zinc-300 hover:bg-white/10">Cargar</button>\n                                <button type="button" onClick={() => deleteCanvaPresentation(item)} className="min-h-10 rounded-lg border border-red-400/20 bg-red-500/10 px-2 text-[9px] font-black uppercase text-red-200 hover:bg-red-500/20"><Trash2 size={12} className="mr-1 inline" />Eliminar</button>\n                              </div>`,
  `<div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">\n                                <button type="button" onClick={() => selectCanvaPresentation(item)} className="min-h-10 rounded-lg border border-white/10 bg-white/5 px-2 text-[9px] font-black uppercase text-zinc-300 hover:bg-white/10"><Edit2 size={12} className="mr-1 inline" />Editar</button>\n                                <button type="button" onClick={() => projectSavedCanva(item)} className="min-h-10 rounded-lg border border-cyan-400/25 bg-cyan-500/10 px-2 text-[9px] font-black uppercase text-cyan-100 hover:bg-cyan-500/20"><Monitor size={12} className="mr-1 inline" />Proyectar</button>\n                                <button type="button" onClick={() => deleteCanvaPresentation(item)} className="min-h-10 rounded-lg border border-red-400/20 bg-red-500/10 px-2 text-[9px] font-black uppercase text-red-200 hover:bg-red-500/20"><Trash2 size={12} className="mr-1 inline" />Eliminar</button>\n                              </div>`,
  'acciones Editar / Proyectar / Eliminar en biblioteca'
);

source = replaceOnce(
  source,
  `<p className="mt-1 text-[10px] font-bold text-zinc-500">{canvaLibrary.length} guardada(s)</p>`,
  `<p className="mt-1 text-[10px] font-bold text-zinc-500">{canvaLibrary.length} guardada(s)</p>\n                          <p className="mt-1 text-[9px] font-bold text-zinc-600">En vivo: {['projector', 'singers', 'musicians'].filter((id) => evento?.canvaOutputs?.[id]?.active).map((id) => id === 'projector' ? 'Proyector' : id === 'singers' ? 'Cantantes' : 'Músicos').join(' · ') || 'ninguna salida'}</p>`,
  'estado real de destinos en vivo'
);

const required = [
  'applyCanvaTargets',
  'runTransaction(db, async (transaction)',
  'clearLegacyCanvaProjection',
  'projectSavedCanva',
  "'Guardar cambios'",
  '>Editar</button>',
  '>Proyectar</button>',
  'En vivo:',
];
for (const marker of required) {
  if (!source.includes(marker)) throw new Error('Validación interna falló: ' + marker);
}

fs.writeFileSync(target, source.replace(/\n/g, eol), 'utf8');
console.log('Fix Canva destinos + edición aplicado: routing transaccional, limpieza legacy y biblioteca editable.');
