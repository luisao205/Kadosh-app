import fs from 'node:fs';

const filePath = 'src/components/live/ProyectorController.jsx';
if (!fs.existsSync(filePath)) throw new Error('No existe ProyectorController.jsx.');

const raw = fs.readFileSync(filePath, 'utf8');
const eol = raw.includes('\r\n') ? '\r\n' : '\n';
let source = raw.replace(/\r\n/g, '\n');
const original = source;

const replaceOnce = (before, after, label) => {
  if (source.includes(after)) {
    console.log(`[skip] ${label}: ya aplicado.`);
    return;
  }
  const hits = source.split(before).length - 1;
  if (hits !== 1) throw new Error(`Se esperaba 1 coincidencia para ${label} y se encontraron ${hits}.`);
  source = source.replace(before, after);
  console.log(`[ok] ${label}`);
};

try {
  // 1) Retiro por salida: la tarjeta En Vivo de la derecha representa únicamente Proyector.
  // No debe depender de los destinos seleccionados en el editor del Canva.
  if (!source.includes('const stopCanvaOutput = async (targetId) => {')) {
    const anchor = '  const stopCanvaProjection = async () => {';
    if (!source.includes(anchor)) throw new Error('No se encontró stopCanvaProjection.');

    const helper = `  const stopCanvaOutput = async (targetId) => {\n    if (!canProjectCanva) {\n      notify('No tienes permiso para retirar Canva.', { type: 'error' });\n      return;\n    }\n    if (!['projector', 'singers', 'musicians'].includes(targetId)) return;\n\n    const outputLabels = { projector: 'Proyector', singers: 'Cantantes', musicians: 'Músicos' };\n    try {\n      if (targetId === 'projector') await clearLegacyCanvaProjection();\n      const eventRef = doc(db, 'eventos', eventoId);\n      await runTransaction(db, async (transaction) => {\n        const snapshot = await transaction.get(eventRef);\n        if (!snapshot.exists()) throw new Error('El evento ya no existe.');\n        const nextOutputs = { ...(snapshot.data()?.canvaOutputs || {}) };\n        delete nextOutputs[targetId];\n        transaction.update(eventRef, { canvaOutputs: nextOutputs });\n      });\n      notify('Canva retirado de ' + outputLabels[targetId] + '.', { type: 'success' });\n    } catch (error) {\n      console.error('Error retirando Canva de una salida:', error);\n      notify('No se pudo retirar Canva de ' + outputLabels[targetId] + '.', { type: 'error' });\n    }\n  };\n\n`;

    source = source.replace(anchor, helper + anchor);
    console.log('[ok] retiro Canva por salida agregado');
  } else {
    console.log('[skip] retiro Canva por salida: ya existe.');
  }

  // 2) Copia antigua: las páginas ya NO se sincronizan entre todas las salidas.
  replaceOnce(
    'Los números de Kadosh sincronizan todas las salidas que muestran esta presentación.',
    'Los números cambian únicamente la pantalla seleccionada; las demás conservan su propia página.',
    'texto de páginas independientes corregido'
  );

  // 3) La tarjeta derecha es la salida Proyector, no un estado Canva global.
  replaceOnce(
    '<p className="text-[10px] font-black uppercase tracking-widest text-cyan-200">Canva en vivo</p>',
    '<p className="text-[10px] font-black uppercase tracking-widest text-cyan-200">Canva en Proyector</p>',
    'título En Vivo identifica Proyector'
  );

  replaceOnce(
    '<button type="button" onClick={stopCanvaProjection} className="rounded-xl border border-amber-400/25 bg-amber-500/10 px-4 py-2 text-[9px] font-black uppercase tracking-wide text-amber-100">Detener Canva</button>',
    '<button type="button" onClick={() => stopCanvaOutput(\'projector\')} className="rounded-xl border border-amber-400/25 bg-amber-500/10 px-4 py-2 text-[9px] font-black uppercase tracking-wide text-amber-100">Retirar de Proyector</button>',
    'botón En Vivo retira solo Proyector'
  );

  // Mostrar la página real del Proyector cuando el routing nuevo la conoce.
  const titleLine = '<p className="max-w-[220px] truncate text-xs font-bold text-white">{evento?.canvaOutputs?.projector?.title || evento?.projectorState?.title || \'Presentación Canva\'}</p>';
  const titleWithPage = `${titleLine}\n                    {evento?.canvaOutputs?.projector?.page && (\n                      <p className="text-[9px] font-black uppercase tracking-wide text-zinc-500">Página {evento.canvaOutputs.projector.page}{evento?.canvaOutputs?.projector?.pageCount ? ' / ' + evento.canvaOutputs.projector.pageCount : ''}</p>\n                    )}`;
  if (!source.includes(titleWithPage)) {
    if (!source.includes(titleLine)) throw new Error('No se encontró el título Canva del preview En Vivo.');
    source = source.replace(titleLine, titleWithPage);
    console.log('[ok] página actual del Proyector visible en En Vivo');
  } else {
    console.log('[skip] página actual del Proyector: ya visible.');
  }

  // Validaciones finales.
  const required = [
    'const stopCanvaOutput = async (targetId) => {',
    "stopCanvaOutput('projector')",
    'Canva en Proyector',
    'Retirar de Proyector',
    'las demás conservan su propia página',
  ];
  for (const marker of required) {
    if (!source.includes(marker)) throw new Error('Validación falló: falta ' + marker);
  }
  if (source.includes('Los números de Kadosh sincronizan todas las salidas que muestran esta presentación.')) {
    throw new Error('Validación falló: quedó el texto antiguo de sincronización global.');
  }

  fs.writeFileSync(filePath, source.replace(/\n/g, eol), 'utf8');
  console.log('[ok] Canva mantiene páginas independientes por pantalla');
  console.log('[ok] tarjeta En Vivo ya no sugiere un Canva global');
  console.log('CANVA INDEPENDENT OUTPUT UI V1 OK: Proyector/Cantantes/Músicos conservan páginas independientes y Retirar afecta solo la salida indicada.');
} catch (error) {
  fs.writeFileSync(filePath, original, 'utf8');
  console.error('[rollback] ProyectorController.jsx restaurado al estado previo.');
  throw error;
}
