import fs from 'node:fs';

const target = 'src/components/live/ProyectorController.jsx';
const raw = fs.readFileSync(target, 'utf8');
const eol = raw.includes('\r\n') ? '\r\n' : '\n';
let source = raw.replace(/\r\n/g, '\n');

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

source = replaceOnce(
  source,
  "  const [isSavingCanva, setIsSavingCanva] = useState(false);\n  const [showScreensMenu, setShowScreensMenu] = useState(false);",
  "  const [isSavingCanva, setIsSavingCanva] = useState(false);\n  const [canvaPage, setCanvaPage] = useState(1);\n  const [showScreensMenu, setShowScreensMenu] = useState(false);",
  'estado de página Canva sincronizada'
);

source = replaceOnce(
  source,
  "  const normalizeCanvaTargets = (targets) => ({",
  String.raw`  const stripCanvaPageHash = (value) => {
    try {
      const url = new URL(String(value || ''));
      url.hash = '';
      return url.toString();
    } catch {
      return String(value || '').split('#')[0];
    }
  };

  const withCanvaPage = (value, page) => {
    const safePage = Math.max(1, Math.floor(Number(page) || 1));
    try {
      const url = new URL(String(value || ''));
      url.hash = String(safePage);
      return url.toString();
    } catch {
      const base = String(value || '').split('#')[0];
      return base ? base + '#' + safePage : '';
    }
  };

  const normalizeCanvaTargets = (targets) => ({`,
  'helpers de enlace Canva por página'
);

source = replaceOnce(
  source,
  "    setCanvaTargets({ projector: true, singers: false, musicians: false });\n  };\n\n  const selectCanvaPresentation = (item) => {",
  "    setCanvaTargets({ projector: true, singers: false, musicians: false });\n    setCanvaPage(1);\n  };\n\n  const selectCanvaPresentation = (item) => {",
  'reiniciar página al crear Canva'
);

source = replaceOnce(
  source,
  "    setCanvaUrlError('');\n    setCanvaTargets({\n      projector: item.defaultTargets?.projector === true,",
  "    setCanvaUrlError('');\n    setCanvaPage(1);\n    setCanvaTargets({\n      projector: item.defaultTargets?.projector === true,",
  'reiniciar página al editar Canva guardado'
);

source = replaceOnce(
  source,
  "  const applyCanvaTargets = async ({ resolved, title, presentationId = '', targets }) => {",
  "  const applyCanvaTargets = async ({ resolved, title, presentationId = '', targets, page = 1 }) => {",
  'applyCanvaTargets recibe página'
);

source = replaceOnce(
  source,
  "      sourceUrl: resolved.sourceUrl,\n      embedUrl: resolved.embedUrl,\n      updatedAt: now,",
  "      sourceUrl: resolved.sourceUrl,\n      embedUrl: withCanvaPage(resolved.embedUrl, page),\n      updatedAt: now,",
  'salida Canva fija página solicitada'
);

source = replaceOnce(
  source,
  "        presentationId: selectedCanvaId || '',\n        targets: canvaTargets,\n      });\n      setCanvaPreviewUrl(resolved.embedUrl);",
  "        presentationId: selectedCanvaId || '',\n        targets: canvaTargets,\n        page: canvaPage,\n      });\n      setCanvaPreviewUrl(withCanvaPage(resolved.embedUrl, canvaPage));",
  'proyección manual respeta página actual'
);

source = replaceOnce(
  source,
  "    setCanvaPreviewUrl(item.embedUrl || '');\n    setCanvaTargets(targets);\n    setCanvaUrlError('');",
  "    setCanvaPreviewUrl(withCanvaPage(item.embedUrl || '', 1));\n    setCanvaTargets(targets);\n    setCanvaPage(1);\n    setCanvaUrlError('');",
  'proyección guardada inicia en página 1'
);

source = replaceOnce(
  source,
  "        presentationId: item.id,\n        targets,\n      });",
  "        presentationId: item.id,\n        targets,\n        page: 1,\n      });",
  'proyección guardada fija página 1'
);

const pageNavigation = String.raw`
  const changeCanvaPage = async (requestedPage) => {
    const nextPage = Math.max(1, Math.floor(Number(requestedPage) || 1));
    const currentPreviewBase = stripCanvaPageHash(canvaPreviewUrl);
    setCanvaPage(nextPage);
    if (currentPreviewBase) setCanvaPreviewUrl(withCanvaPage(currentPreviewBase, nextPage));

    const eventRef = doc(db, 'eventos', eventoId);
    try {
      let changedOutputs = 0;
      await runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(eventRef);
        if (!snapshot.exists()) throw new Error('El evento ya no existe.');
        const data = snapshot.data();
        const nextOutputs = { ...(data.canvaOutputs || {}) };
        const now = Date.now();

        ['projector', 'singers', 'musicians'].forEach((targetId) => {
          const existing = nextOutputs[targetId];
          if (!existing?.active || !existing?.embedUrl) return;

          const samePresentation = selectedCanvaId
            ? existing.presentationId === selectedCanvaId
            : Boolean(currentPreviewBase) && stripCanvaPageHash(existing.embedUrl) === currentPreviewBase;
          if (!samePresentation) return;

          nextOutputs[targetId] = {
            ...existing,
            embedUrl: withCanvaPage(existing.embedUrl, nextPage),
            updatedAt: now,
            updatedBy: user?.nombre || user?.email || 'Multimedia',
          };
          changedOutputs += 1;
        });

        if (changedOutputs > 0) transaction.update(eventRef, { canvaOutputs: nextOutputs });
      });

      if (changedOutputs > 0) {
        notify('Canva sincronizado en página ' + nextPage + '.', { type: 'success' });
      }
    } catch (error) {
      console.error('Error sincronizando página Canva:', error);
      notify('No se pudo sincronizar la página de Canva.', { type: 'error' });
    }
  };

`;

source = replaceOnce(
  source,
  "  const stopCanvaProjection = async () => {",
  pageNavigation + "  const stopCanvaProjection = async () => {",
  'navegación sincronizada de páginas Canva'
);

source = replaceOnce(
  source,
  `                      <div className="aspect-video w-full bg-black">\n                        <iframe src={canvaPreviewUrl} title="Vista previa Canva" className="h-full w-full border-0" allow="fullscreen" allowFullScreen loading="lazy" />\n                      </div>`,
  `                      <div className="flex flex-wrap items-center justify-center gap-2 border-b border-white/10 bg-zinc-950/90 p-2 sm:p-3">\n                        <button type="button" onClick={() => changeCanvaPage(canvaPage - 1)} disabled={canvaPage <= 1} className="min-h-11 rounded-xl border border-white/10 bg-white/5 px-4 text-[10px] font-black uppercase text-zinc-200 disabled:cursor-not-allowed disabled:opacity-30">← Anterior</button>\n                        <div className="flex min-h-11 items-center gap-2 rounded-xl border border-cyan-400/20 bg-cyan-500/10 px-3">\n                          <span className="text-[9px] font-black uppercase tracking-wide text-cyan-200">Página</span>\n                          <input type="number" min="1" value={canvaPage} onChange={(event) => setCanvaPage(Math.max(1, Number(event.target.value) || 1))} className="w-16 bg-transparent text-center text-sm font-black text-white outline-none" />\n                          <button type="button" onClick={() => changeCanvaPage(canvaPage)} className="rounded-lg bg-cyan-400 px-2.5 py-1.5 text-[9px] font-black uppercase text-zinc-950">Ir</button>\n                        </div>\n                        <button type="button" onClick={() => changeCanvaPage(canvaPage + 1)} className="min-h-11 rounded-xl border border-white/10 bg-white/5 px-4 text-[10px] font-black uppercase text-zinc-200">Siguiente →</button>\n                        <p className="basis-full text-center text-[9px] font-bold text-zinc-500">Usa estos controles de Kadosh para mantener sincronizadas todas las salidas que muestran esta presentación.</p>\n                      </div>\n                      <div className="aspect-video w-full bg-black">\n                        <iframe key={canvaPreviewUrl} src={canvaPreviewUrl} title="Vista previa Canva" className="h-full w-full border-0" allow="fullscreen" allowFullScreen loading="lazy" />\n                      </div>`,
  'controles de página Canva en preview'
);

const required = [
  'const [canvaPage, setCanvaPage] = useState(1);',
  'const withCanvaPage = (value, page) => {',
  'const changeCanvaPage = async (requestedPage) => {',
  "notify('Canva sincronizado en página ' + nextPage + '.', { type: 'success' });",
  '← Anterior',
  'Siguiente →',
  'key={canvaPreviewUrl}',
];
for (const marker of required) {
  if (!source.includes(marker)) throw new Error('Validación interna falló: ' + marker);
}

fs.writeFileSync(target, source.replace(/\n/g, eol), 'utf8');
console.log('Fix Canva navegación sincronizada aplicado: página controlada desde Kadosh por Firestore.');
