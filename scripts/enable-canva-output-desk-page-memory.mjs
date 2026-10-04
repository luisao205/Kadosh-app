import fs from 'node:fs';

const filePath = 'src/components/live/ProyectorController.jsx';
if (!fs.existsSync(filePath)) throw new Error('No existe ProyectorController.jsx.');

const raw = fs.readFileSync(filePath, 'utf8');
const eol = raw.includes('\r\n') ? '\r\n' : '\n';
let source = raw.replace(/\r\n/g, '\n');
const original = source;

const replaceExact = (before, after, label) => {
  if (source.includes(after)) {
    console.log('[skip] ' + label + ': ya aplicado.');
    return;
  }
  if (!source.includes(before)) throw new Error('No se encontró el bloque para ' + label + '.');
  source = source.replace(before, after);
  console.log('[ok] ' + label);
};

const replaceBetween = (startMarker, endMarker, replacement, label) => {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) throw new Error('No se encontró el rango para ' + label + '.');
  source = source.slice(0, start) + replacement + source.slice(end);
  console.log('[ok] ' + label);
};

if (!source.includes('KADOSH_MULTIMEDIA_UPLOAD_REVIEW_V1')) {
  throw new Error('Este helper espera la rama posterior al fix Multimedia 1.1.11.');
}

// 1) Estado: la salida que el operador está controlando.
replaceExact(
  "  const [canvaPageWindowStart, setCanvaPageWindowStart] = useState(1);\n  const [showScreensMenu, setShowScreensMenu] = useState(false);",
  "  const [canvaPageWindowStart, setCanvaPageWindowStart] = useState(1);\n  // KADOSH_CANVA_OUTPUT_DESK_V1\n  const [canvaControlTarget, setCanvaControlTarget] = useState('projector');\n  const [showScreensMenu, setShowScreensMenu] = useState(false);",
  'estado de salida Canva controlada'
);

// 2) Helpers de memoria de página por presentación + salida.
const normalizeAnchor = '  const normalizeCanvaTargets = (targets) => ({';
if (!source.includes('const getCanvaMemoryKey = (presentationId')) {
  if (!source.includes(normalizeAnchor)) throw new Error('No se encontró normalizeCanvaTargets.');
  const helpers = String.raw`  const getCanvaPageFromUrl = (value, fallback = 1) => {
    try {
      const hash = String(new URL(String(value || '')).hash || '').replace(/^#/, '');
      const parsed = Math.floor(Number(hash));
      return Number.isFinite(parsed) && parsed >= 1 ? parsed : Math.max(1, Math.floor(Number(fallback) || 1));
    } catch {
      const hash = String(value || '').split('#')[1] || '';
      const parsed = Math.floor(Number(hash));
      return Number.isFinite(parsed) && parsed >= 1 ? parsed : Math.max(1, Math.floor(Number(fallback) || 1));
    }
  };

  const getCanvaMemoryKey = (presentationId = '', sourceUrl = '') => {
    const safeId = String(presentationId || '').trim();
    if (safeId) return 'id:' + safeId;
    const safeSource = stripCanvaPageHash(sourceUrl || '').trim();
    return safeSource ? 'url:' + safeSource : '';
  };

  const readRememberedCanvaPage = (eventData, targetId, presentationId, sourceUrl, fallback = 1) => {
    const key = getCanvaMemoryKey(presentationId, sourceUrl);
    const stored = key ? eventData?.canvaPageMemory?.[targetId]?.[key] : null;
    const parsed = Math.floor(Number(stored));
    return Number.isFinite(parsed) && parsed >= 1 ? parsed : Math.max(1, Math.floor(Number(fallback) || 1));
  };

  const cloneCanvaPageMemory = (value) => {
    const current = value && typeof value === 'object' ? value : {};
    return {
      projector: { ...(current.projector || {}) },
      singers: { ...(current.singers || {}) },
      musicians: { ...(current.musicians || {}) },
    };
  };

`;
  source = source.replace(normalizeAnchor, helpers + normalizeAnchor);
  console.log('[ok] memoria Canva por presentación y pantalla');
} else {
  console.log('[skip] memoria Canva por presentación y pantalla: ya aplicada.');
}

// 3) Seleccionar una presentación restaura la página de la salida bajo control.
const selectStart = '  const selectCanvaPresentation = (item) => {';
const saveStart = '  const saveCanvaPresentation = async () => {';
if (!source.includes('const selectCanvaPresentation = (item, targetId = canvaControlTarget')) {
  const replacement = String.raw`  const selectCanvaPresentation = (item, targetId = canvaControlTarget, pageOverride = null) => {
    if (!item) return;
    const fallbackPage = pageOverride == null
      ? readRememberedCanvaPage(evento, targetId, item.id, item.sourceUrl || item.inputUrl || item.embedUrl || '', 1)
      : Math.max(1, Math.floor(Number(pageOverride) || 1));
    const safePageCount = Number(item.pageCount) >= 1
      ? Math.max(1, Math.min(500, Math.floor(Number(item.pageCount))))
      : 0;
    const restoredPage = safePageCount ? Math.min(safePageCount, fallbackPage) : fallbackPage;

    setSelectedCanvaId(item.id);
    setCanvaDraft({
      title: item.title || 'Presentación Canva',
      url: item.inputUrl || item.sourceUrl || '',
    });
    setCanvaPreviewUrl(withCanvaPage(item.embedUrl || '', restoredPage));
    setCanvaUrlError('');
    setCanvaPage(restoredPage);
    setCanvaPageCount(safePageCount);
    setCanvaPageWindowStart((Math.floor((restoredPage - 1) / 10) * 10) + 1);
    setCanvaTargets({
      projector: item.defaultTargets?.projector === true,
      singers: item.defaultTargets?.singers === true,
      musicians: item.defaultTargets?.musicians === true,
    });
  };

`;
  replaceBetween(selectStart, saveStart, replacement, 'restaurar página al cambiar de Canva');
} else {
  console.log('[skip] restaurar página al cambiar de Canva: ya aplicado.');
}

// 4) Al enviar Canva, cada pantalla retoma SU página recordada.
const applyStart = '  const applyCanvaTargets = async ({ resolved, title, presentationId = \'\', targets, page = 1 }) => {';
const projectStart = '  const projectCanva = async () => {';
if (!source.includes('canvaPageMemory: nextMemory')) {
  const replacement = String.raw`  const applyCanvaTargets = async ({ resolved, title, presentationId = '', targets, page = 1, pageCount = canvaPageCount }) => {
    const safeTargets = normalizeCanvaTargets(targets);
    if (!hasTargets(safeTargets)) throw new Error('Selecciona al menos un destino.');

    await clearLegacyCanvaProjection();

    const eventRef = doc(db, 'eventos', eventoId);
    const safeFallbackPage = Math.max(1, Math.floor(Number(page) || 1));
    const safePageCount = Number(pageCount) >= 1 ? Math.max(1, Math.min(500, Math.floor(Number(pageCount)))) : 0;
    const memoryKey = getCanvaMemoryKey(presentationId, resolved.sourceUrl || resolved.embedUrl || '');

    await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(eventRef);
      if (!snapshot.exists()) throw new Error('El evento ya no existe.');
      const data = snapshot.data();
      const nextOutputs = { ...(data.canvaOutputs || {}) };
      const nextMediaOutputs = { ...(data.mediaOutputs || {}) };
      const nextMemory = cloneCanvaPageMemory(data.canvaPageMemory);
      const now = Date.now();

      ['projector', 'singers', 'musicians'].forEach((targetId) => {
        if (safeTargets[targetId]) {
          const remembered = readRememberedCanvaPage(data, targetId, presentationId, resolved.sourceUrl || resolved.embedUrl || '', safeFallbackPage);
          const targetPage = safePageCount ? Math.min(safePageCount, remembered) : remembered;
          nextOutputs[targetId] = {
            active: true,
            presentationId: presentationId || '',
            title,
            sourceUrl: resolved.sourceUrl,
            embedUrl: withCanvaPage(resolved.embedUrl, targetPage),
            page: targetPage,
            pageCount: safePageCount,
            updatedAt: now,
            updatedBy: user?.nombre || user?.email || 'Multimedia',
          };
          if (memoryKey) nextMemory[targetId][memoryKey] = targetPage;
          delete nextMediaOutputs[targetId];
          return;
        }

        const existing = nextOutputs[targetId];
        const samePresentation = presentationId
          ? existing?.presentationId === presentationId
          : existing?.sourceUrl === resolved.sourceUrl;
        if (samePresentation) delete nextOutputs[targetId];
      });

      transaction.update(eventRef, {
        canvaOutputs: nextOutputs,
        mediaOutputs: nextMediaOutputs,
        canvaPageMemory: nextMemory,
      });
    });
  };

`;
  replaceBetween(applyStart, projectStart, replacement, 'enrutamiento Canva con página independiente');
} else {
  console.log('[skip] enrutamiento Canva con página independiente: ya aplicado.');
}

// Añadir pageCount a la proyección manual.
replaceExact(
  "        targets: canvaTargets,\n        page: canvaPage,\n      });",
  "        targets: canvaTargets,\n        page: canvaPage,\n        pageCount: canvaPageCount,\n      });",
  'pageCount en proyección Canva manual'
);

// 5) Proyectar desde biblioteca ya no vuelve a página 1.
const savedStart = '  const projectSavedCanva = async (item) => {';
const changeStart = '  const changeCanvaPage = async (requestedPage) => {';
if (!source.includes("proyectado retomando sus páginas guardadas")) {
  const replacement = String.raw`  const projectSavedCanva = async (item) => {
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

    const pageForControlTarget = readRememberedCanvaPage(
      evento,
      canvaControlTarget,
      item.id,
      item.sourceUrl || item.inputUrl || item.embedUrl || '',
      1
    );
    selectCanvaPresentation(item, canvaControlTarget, pageForControlTarget);

    try {
      await applyCanvaTargets({
        resolved,
        title: item.title || 'Presentación Canva',
        presentationId: item.id,
        targets,
        page: pageForControlTarget,
        pageCount: item.pageCount,
      });
      notify('"' + (item.title || 'Canva') + '" proyectado retomando sus páginas guardadas.', { type: 'success' });
    } catch (error) {
      console.error('Error proyectando Canva guardado:', error);
      notify('No se pudo proyectar la presentación guardada.', { type: 'error' });
    }
  };

`;
  replaceBetween(savedStart, changeStart, replacement, 'biblioteca Canva retoma página');
} else {
  console.log('[skip] biblioteca Canva retoma página: ya aplicado.');
}

// 6) Cambiar página afecta solo la pantalla que el operador está controlando y guarda memoria.
const currentChangeStart = source.includes('  const changeCanvaPage = async (requestedPage, targetId = canvaControlTarget) => {')
  ? '  const changeCanvaPage = async (requestedPage, targetId = canvaControlTarget) => {'
  : '  const changeCanvaPage = async (requestedPage) => {';
const pageConstantsStart = '  const canvaHasConfiguredPageCount = Number(canvaPageCount) >= 1;';
if (!source.includes('const changeCanvaPage = async (requestedPage, targetId = canvaControlTarget)')) {
  const replacement = String.raw`  const changeCanvaPage = async (requestedPage, targetId = canvaControlTarget) => {
    const safePageCount = Math.max(1, Math.min(500, Math.floor(Number(canvaPageCount) || 1)));
    const nextPage = Math.max(1, Math.min(safePageCount, Math.floor(Number(requestedPage) || 1)));
    const currentPreviewBase = stripCanvaPageHash(canvaPreviewUrl);
    setCanvaControlTarget(targetId);
    setCanvaPage(nextPage);
    setCanvaPageWindowStart((Math.floor((nextPage - 1) / 10) * 10) + 1);
    if (currentPreviewBase) setCanvaPreviewUrl(withCanvaPage(currentPreviewBase, nextPage));

    const eventRef = doc(db, 'eventos', eventoId);
    try {
      await runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(eventRef);
        if (!snapshot.exists()) throw new Error('El evento ya no existe.');
        const data = snapshot.data();
        const nextOutputs = { ...(data.canvaOutputs || {}) };
        const nextMemory = cloneCanvaPageMemory(data.canvaPageMemory);
        const existing = nextOutputs[targetId];
        const sourceForMemory = currentPreviewBase || canvaDraft.url || existing?.sourceUrl || existing?.embedUrl || '';
        const presentationForMemory = selectedCanvaId || existing?.presentationId || '';
        const memoryKey = getCanvaMemoryKey(presentationForMemory, sourceForMemory);
        const samePresentation = existing?.active && (
          selectedCanvaId
            ? existing.presentationId === selectedCanvaId
            : Boolean(currentPreviewBase) && stripCanvaPageHash(existing.embedUrl) === currentPreviewBase
        );

        if (samePresentation) {
          nextOutputs[targetId] = {
            ...existing,
            embedUrl: withCanvaPage(existing.embedUrl, nextPage),
            page: nextPage,
            pageCount: Number(existing.pageCount) >= 1 ? existing.pageCount : safePageCount,
            updatedAt: Date.now(),
            updatedBy: user?.nombre || user?.email || 'Multimedia',
          };
        }
        if (memoryKey) nextMemory[targetId][memoryKey] = nextPage;

        transaction.update(eventRef, {
          canvaOutputs: nextOutputs,
          canvaPageMemory: nextMemory,
        });
      });
    } catch (error) {
      console.error('Error sincronizando página Canva:', error);
      notify('No se pudo sincronizar la página de Canva.', { type: 'error' });
    }
  };

`;
  replaceBetween(currentChangeStart, pageConstantsStart, replacement, 'página Canva por pantalla');
} else {
  console.log('[skip] página Canva por pantalla: ya aplicado.');
}

// 7) Consola por salida para PC y móvil.
const stopAnchor = '  const stopCanvaProjection = async () => {';
if (!source.includes('const renderCanvaOutputDesk = ({ compact = false } = {}) => {')) {
  const block = String.raw`  const CANVA_OUTPUT_DESK_META = {
    projector: { label: 'Proyector', Icon: Monitor },
    singers: { label: 'Cantantes', Icon: Type },
    musicians: { label: 'Músicos', Icon: Music },
  };

  const selectCanvaControlTarget = (targetId) => {
    setCanvaControlTarget(targetId);
    const liveOutput = evento?.canvaOutputs?.[targetId];
    if (liveOutput?.active) {
      const item = canvaLibrary.find((candidate) =>
        (liveOutput.presentationId && candidate.id === liveOutput.presentationId)
        || (!liveOutput.presentationId && stripCanvaPageHash(candidate.embedUrl || '') === stripCanvaPageHash(liveOutput.embedUrl || ''))
      );
      if (item) {
        selectCanvaPresentation(item, targetId, liveOutput.page || getCanvaPageFromUrl(liveOutput.embedUrl, 1));
        return;
      }
    }

    const currentItem = canvaLibrary.find((candidate) => candidate.id === selectedCanvaId);
    if (currentItem) selectCanvaPresentation(currentItem, targetId);
  };

  const stopCanvaOutputTarget = async (targetId) => {
    if (!canProjectCanva) return;
    try {
      await runTransaction(db, async (transaction) => {
        const eventRef = doc(db, 'eventos', eventoId);
        const snapshot = await transaction.get(eventRef);
        if (!snapshot.exists()) throw new Error('El evento ya no existe.');
        const nextOutputs = { ...(snapshot.data()?.canvaOutputs || {}) };
        delete nextOutputs[targetId];
        transaction.update(eventRef, { canvaOutputs: nextOutputs });
      });
    } catch (error) {
      console.error('Error retirando Canva de salida:', error);
      notify('No se pudo retirar Canva de esa pantalla.', { type: 'error' });
    }
  };

  const renderCanvaOutputDesk = ({ compact = false } = {}) => {
    const liveOutput = evento?.canvaOutputs?.[canvaControlTarget];
    const activeItem = liveOutput?.presentationId
      ? canvaLibrary.find((item) => item.id === liveOutput.presentationId)
      : null;
    const pageCount = Number(liveOutput?.pageCount) >= 1
      ? Math.max(1, Math.floor(Number(liveOutput.pageCount)))
      : Number(activeItem?.pageCount) >= 1
        ? Math.max(1, Math.floor(Number(activeItem.pageCount)))
        : 0;
    const currentPage = liveOutput?.active
      ? Math.max(1, Math.floor(Number(liveOutput.page) || getCanvaPageFromUrl(liveOutput.embedUrl, 1)))
      : canvaPage;

    return (
      <div className={compact ? 'rounded-2xl border border-cyan-400/20 bg-cyan-500/[0.06] p-3' : 'rounded-2xl border border-cyan-400/20 bg-cyan-500/[0.06] p-4'}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-cyan-300">Control por pantalla</p>
            <p className="mt-1 text-[10px] font-bold text-zinc-500">Cada salida conserva su Canva y su página.</p>
          </div>
          {liveOutput?.active && <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2 py-1 text-[8px] font-black uppercase text-emerald-200">En vivo</span>}
        </div>

        <div className="grid grid-cols-3 gap-2">
          {Object.entries(CANVA_OUTPUT_DESK_META).map(([targetId, meta]) => {
            const output = evento?.canvaOutputs?.[targetId];
            const outputPage = output?.active ? Math.max(1, Math.floor(Number(output.page) || getCanvaPageFromUrl(output.embedUrl, 1))) : null;
            const Icon = meta.Icon;
            const selected = canvaControlTarget === targetId;
            return (
              <button
                key={targetId}
                type="button"
                onClick={() => selectCanvaControlTarget(targetId)}
                className={'min-w-0 rounded-xl border p-2 text-left transition-colors ' + (selected ? 'border-cyan-300/50 bg-cyan-400 text-zinc-950' : 'border-white/10 bg-black/30 text-zinc-300')}
              >
                <span className="flex items-center gap-1 text-[8px] font-black uppercase"><Icon size={11}/>{meta.label}</span>
                <span className={'mt-1 block truncate text-[9px] font-black ' + (selected ? 'text-zinc-950' : 'text-white')}>{output?.active ? (output.title || 'Canva') : 'Libre'}</span>
                <span className={'mt-0.5 block text-[8px] font-bold ' + (selected ? 'text-zinc-800' : 'text-zinc-600')}>{output?.active ? 'Página ' + outputPage : 'Sin Canva'}</span>
              </button>
            );
          })}
        </div>

        {liveOutput?.active && (
          <div className="mt-3 rounded-xl border border-white/10 bg-black/30 p-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-[10px] font-black text-white">{liveOutput.title || 'Presentación Canva'}</p>
                <p className="mt-0.5 text-[8px] font-bold uppercase text-zinc-500">{CANVA_OUTPUT_DESK_META[canvaControlTarget].label} · Página {currentPage}{pageCount ? ' / ' + pageCount : ''}</p>
              </div>
              <button type="button" onClick={() => stopCanvaOutputTarget(canvaControlTarget)} className="shrink-0 rounded-lg border border-red-400/20 bg-red-500/10 px-2 py-1.5 text-[8px] font-black uppercase text-red-200">Retirar</button>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button type="button" disabled={currentPage <= 1} onClick={() => changeCanvaPage(currentPage - 1, canvaControlTarget)} className="min-h-10 rounded-xl border border-white/10 bg-white/5 text-[9px] font-black uppercase text-zinc-200 disabled:opacity-30">← Anterior</button>
              <button type="button" disabled={pageCount > 0 && currentPage >= pageCount} onClick={() => changeCanvaPage(currentPage + 1, canvaControlTarget)} className="min-h-10 rounded-xl border border-cyan-400/20 bg-cyan-500/10 text-[9px] font-black uppercase text-cyan-100 disabled:opacity-30">Siguiente →</button>
            </div>
          </div>
        )}
      </div>
    );
  };

`;
  if (!source.includes(stopAnchor)) throw new Error('No se encontró stopCanvaProjection.');
  source = source.replace(stopAnchor, block + stopAnchor);
  console.log('[ok] consola Canva por pantalla');
} else {
  console.log('[skip] consola Canva por pantalla: ya aplicada.');
}

// 8) Desktop: consola inmediatamente después de la explicación Canva.
const desktopNeedle = `                        <p className="mt-1 text-[10px] font-bold leading-relaxed text-zinc-500">Los destinos quedan guardados por presentación. Proyector, Cantantes y Músicos pueden conservar contenidos distintos al mismo tiempo.</p>\n                      </div>\n                    </div>\n                  </div>\n\n                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)]">`;
const desktopAfter = `                        <p className="mt-1 text-[10px] font-bold leading-relaxed text-zinc-500">Los destinos quedan guardados por presentación. Proyector, Cantantes y Músicos pueden conservar contenidos distintos al mismo tiempo.</p>\n                      </div>\n                    </div>\n                  </div>\n\n                  {renderCanvaOutputDesk()}\n\n                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)]">`;
replaceExact(desktopNeedle, desktopAfter, 'consola Canva visible en PC');

// 9) Móvil: quitar el bloque Canva duplicado antiguo y dejar una sola interfaz.
const mobileLegacyMarker = '        {/* KADOSH_CANVA_MOBILE_V4 */}';
if (source.includes(mobileLegacyMarker)) {
  const legacyStart = source.indexOf(mobileLegacyMarker);
  const nextBlock = source.indexOf("        {projectionSourceMode === 'canva' && (", legacyStart + mobileLegacyMarker.length);
  if (nextBlock < 0) throw new Error('No se encontró la interfaz Canva móvil nueva.');
  source = source.slice(0, legacyStart) + source.slice(nextBlock);
  console.log('[ok] eliminada interfaz Canva móvil duplicada');
} else {
  console.log('[skip] interfaz Canva móvil duplicada: ya eliminada.');
}

const mobileNeedle = `            ) : (\n              <>\n                <div className="rounded-2xl border border-cyan-400/20 bg-cyan-500/[0.07] p-4">`;
const mobileAfter = `            ) : (\n              <>\n                {renderCanvaOutputDesk({ compact: true })}\n                <div className="rounded-2xl border border-cyan-400/20 bg-cyan-500/[0.07] p-4">`;
replaceExact(mobileNeedle, mobileAfter, 'consola Canva visible en móvil');

// Validaciones conservadoras.
const required = [
  'KADOSH_CANVA_OUTPUT_DESK_V1',
  'canvaPageMemory: nextMemory',
  'const renderCanvaOutputDesk = ({ compact = false } = {}) => {',
  'const changeCanvaPage = async (requestedPage, targetId = canvaControlTarget) => {',
  '{renderCanvaOutputDesk()}',
  '{renderCanvaOutputDesk({ compact: true })}',
];
for (const marker of required) {
  if (!source.includes(marker)) throw new Error('Validación falló: falta ' + marker);
}
if (source.includes(mobileLegacyMarker)) throw new Error('Validación falló: sigue el bloque Canva móvil duplicado.');

try {
  fs.writeFileSync(filePath, source.replace(/\n/g, eol), 'utf8');
  console.log('Canva Output Desk aplicado: cada pantalla conserva presentación y página; PC y móvil controlan una salida a la vez.');
} catch (error) {
  fs.writeFileSync(filePath, original.replace(/\n/g, eol), 'utf8');
  throw error;
}
