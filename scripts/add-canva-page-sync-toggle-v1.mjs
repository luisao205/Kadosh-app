import fs from 'node:fs';

const filePath = 'src/components/live/ProyectorController.jsx';
if (!fs.existsSync(filePath)) throw new Error('No existe ProyectorController.jsx.');

const raw = fs.readFileSync(filePath, 'utf8');
const eol = raw.includes('\r\n') ? '\r\n' : '\n';
let source = raw.replace(/\r\n/g, '\n');
const original = source;

const count = (text, needle) => text.split(needle).length - 1;

try {
  if (!source.includes('KADOSH_CANVA_OUTPUT_DESK_V1')) {
    throw new Error('Este helper requiere Control por pantalla Canva.');
  }
  if (!source.includes('const changeCanvaPage = async (requestedPage, targetId = canvaControlTarget) => {')) {
    throw new Error('No se encontró la versión de páginas independientes de Canva.');
  }
  if (!source.includes('const renderCanvaOutputDesk = ({ compact = false } = {}) => {')) {
    throw new Error('No se encontró renderCanvaOutputDesk.');
  }

  // 1) Estado local. Independiente por defecto; sincronizado solo cuando el operador lo activa.
  if (!source.includes('const [canvaPageSyncMode, setCanvaPageSyncMode] = useState(false);')) {
    const anchor = "  const [canvaControlTarget, setCanvaControlTarget] = useState('projector');";
    if (!source.includes(anchor)) throw new Error('No se encontró canvaControlTarget.');
    source = source.replace(
      anchor,
      anchor + "\n  // KADOSH_CANVA_PAGE_SYNC_TOGGLE_V1\n  const [canvaPageSyncMode, setCanvaPageSyncMode] = useState(false);"
    );
    console.log('[ok] modo de páginas Canva independiente/sincronizado agregado');
  } else {
    console.log('[skip] estado de sincronización Canva: ya existe');
  }

  // 2) Cambiar página: independiente por defecto; en sync mueve SOLO salidas que muestran el mismo Canva.
  const changeStart = '  const changeCanvaPage = async (requestedPage, targetId = canvaControlTarget) => {';
  const changeEnd = '  const canvaHasConfiguredPageCount = Number(canvaPageCount) >= 1;';
  const start = source.indexOf(changeStart);
  const end = source.indexOf(changeEnd, start);
  if (start < 0 || end < 0) throw new Error('No se pudo aislar changeCanvaPage.');

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
        const anchorOutput = nextOutputs[targetId];
        const anchorPresentationId = anchorOutput?.presentationId || selectedCanvaId || '';
        const anchorSource = stripCanvaPageHash(anchorOutput?.sourceUrl || anchorOutput?.embedUrl || currentPreviewBase || canvaDraft.url || '');
        const now = Date.now();

        const isSameCanva = (output) => {
          if (!output?.active || !output?.embedUrl) return false;
          if (anchorPresentationId) return output.presentationId === anchorPresentationId;
          const outputSource = stripCanvaPageHash(output.sourceUrl || output.embedUrl || '');
          return Boolean(anchorSource) && outputSource === anchorSource;
        };

        const targetIds = canvaPageSyncMode
          ? ['projector', 'singers', 'musicians'].filter((outputId) => isSameCanva(nextOutputs[outputId]))
          : [targetId];

        targetIds.forEach((outputId) => {
          const existing = nextOutputs[outputId];
          if (!isSameCanva(existing)) return;
          const outputPageCount = Number(existing.pageCount) >= 1
            ? Math.max(1, Math.min(500, Math.floor(Number(existing.pageCount))))
            : safePageCount;
          const outputPage = Math.min(outputPageCount, nextPage);
          nextOutputs[outputId] = {
            ...existing,
            embedUrl: withCanvaPage(existing.embedUrl, outputPage),
            page: outputPage,
            pageCount: outputPageCount,
            updatedAt: now,
            updatedBy: user?.nombre || user?.email || 'Multimedia',
          };
          const memoryKey = getCanvaMemoryKey(
            existing.presentationId || anchorPresentationId,
            existing.sourceUrl || existing.embedUrl || anchorSource
          );
          if (memoryKey) nextMemory[outputId][memoryKey] = outputPage;
        });

        transaction.update(eventRef, {
          canvaOutputs: nextOutputs,
          canvaPageMemory: nextMemory,
        });
      });
    } catch (error) {
      console.error('Error cambiando página Canva:', error);
      notify('No se pudo cambiar la página de Canva.', { type: 'error' });
    }
  };

`;

  source = source.slice(0, start) + replacement + source.slice(end);
  console.log('[ok] cambio de página Canva respeta modo individual o sincronizado');

  // 3) Toggle compartido por PC y móvil dentro de Control por pantalla.
  const deskText = '<p className="mt-1 text-[10px] font-bold text-zinc-500">Cada salida conserva su Canva y su página.</p>';
  if (!source.includes('KADOSH_CANVA_PAGE_SYNC_TOGGLE_UI_V1')) {
    if (!source.includes(deskText)) throw new Error('No se encontró texto de Control por pantalla.');
    const ui = `${deskText}\n          {/* KADOSH_CANVA_PAGE_SYNC_TOGGLE_UI_V1 */}\n          <div className="mt-2 inline-flex rounded-xl border border-white/10 bg-black/25 p-1">\n            <button\n              type="button"\n              onClick={() => setCanvaPageSyncMode(false)}\n              className={'rounded-lg px-2.5 py-1.5 text-[8px] font-black uppercase transition-colors ' + (!canvaPageSyncMode ? 'bg-cyan-400 text-zinc-950' : 'text-zinc-500 hover:text-zinc-200')}\n            >\n              Individual\n            </button>\n            <button\n              type="button"\n              onClick={() => setCanvaPageSyncMode(true)}\n              className={'rounded-lg px-2.5 py-1.5 text-[8px] font-black uppercase transition-colors ' + (canvaPageSyncMode ? 'bg-violet-500 text-white' : 'text-zinc-500 hover:text-zinc-200')}\n            >\n              Sincronizar\n            </button>\n          </div>\n          <p className="mt-1 text-[8px] font-bold text-zinc-600">{canvaPageSyncMode ? 'Los cambios de página afectan solo las pantallas que muestran este mismo Canva.' : 'Los cambios de página afectan únicamente la pantalla seleccionada.'}</p>`;
    source = source.replace(deskText, ui);
    console.log('[ok] selector Individual / Sincronizar visible en PC y móvil');
  } else {
    console.log('[skip] selector de modo Canva: ya existe');
  }

  if (count(source, 'const [canvaPageSyncMode, setCanvaPageSyncMode] = useState(false);') !== 1) {
    throw new Error('Validación falló: estado canvaPageSyncMode duplicado.');
  }
  if (count(source, 'KADOSH_CANVA_PAGE_SYNC_TOGGLE_UI_V1') !== 1) {
    throw new Error('Validación falló: UI de sincronización Canva duplicada.');
  }
  if (!source.includes("const targetIds = canvaPageSyncMode")) {
    throw new Error('Validación falló: changeCanvaPage no usa canvaPageSyncMode.');
  }
  if (!source.includes("['projector', 'singers', 'musicians'].filter((outputId) => isSameCanva(nextOutputs[outputId]))")) {
    throw new Error('Validación falló: sync debe limitarse al mismo Canva.');
  }

  fs.writeFileSync(filePath, source.replace(/\n/g, eol), 'utf8');
  console.log('[ok] modo independiente sigue siendo el predeterminado');
  console.log('[ok] modo sincronizado mueve únicamente salidas con el mismo Canva');
  console.log('[ok] tercera salida con otro Canva o contenido queda intacta');
  console.log('CANVA PAGE SYNC TOGGLE V1 OK: prueba Individual y Sincronizar en PC y móvil.');
} catch (error) {
  fs.writeFileSync(filePath, original, 'utf8');
  console.error('[rollback] ProyectorController.jsx restaurado al estado previo.');
  throw error;
}
