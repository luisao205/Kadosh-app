import fs from 'node:fs';

const paths = {
  controller: 'src/components/live/ProyectorController.jsx',
  projector: 'src/components/live/Proyector.jsx',
  functions: 'functions/index.js',
  rules: 'firestore.rules',
};

for (const filePath of Object.values(paths)) {
  if (!fs.existsSync(filePath)) throw new Error(`No existe ${filePath}.`);
}

const read = (filePath) => {
  const raw = fs.readFileSync(filePath, 'utf8');
  return {
    eol: raw.includes('\r\n') ? '\r\n' : '\n',
    original: raw,
    text: raw.replace(/\r\n/g, '\n'),
  };
};

const files = Object.fromEntries(Object.entries(paths).map(([key, filePath]) => [key, read(filePath)]));

const replaceExact = (key, before, after, label) => {
  const file = files[key];
  if (file.text.includes(after)) {
    console.log(`[skip] ${label}: ya aplicado.`);
    return;
  }
  if (!file.text.includes(before)) throw new Error(`No se encontró el bloque para ${label}.`);
  file.text = file.text.replace(before, after);
  console.log(`[ok] ${label}`);
};

// 1) Todo contenido que toma el PROYECTOR retira solo las rutas del proyector.
//    Cantantes/Músicos conservan su Canva o multimedia independiente.
{
  const file = files.controller;
  const pairRegex = /(^[ \t]*)canvaOutputs: \{\},\n\1mediaOutputs: \{\},/gm;
  const matches = [...file.text.matchAll(pairRegex)];
  if (matches.length > 0) {
    file.text = file.text.replace(pairRegex, (full, indent) => (
      `${indent}'canvaOutputs.projector': deleteField(),\n${indent}'mediaOutputs.projector': deleteField(),`
    ));
    console.log(`[ok] handoff automático del Proyector en ${matches.length} acciones (Canciones/Prédica/Biblia)`);
  } else if (file.text.includes("'canvaOutputs.projector': deleteField()") && file.text.includes("'mediaOutputs.projector': deleteField()")) {
    console.log('[skip] handoff automático del Proyector: ya aplicado.');
  } else {
    throw new Error('No se encontraron las escrituras de handoff del Proyector.');
  }
}

// 2) Preview del Controlador: un Canva viejo no debe tapar una fuente nueva.
replaceExact(
  'controller',
  `  const projectorPreviewMedia = evento?.mediaOutputs && typeof evento.mediaOutputs === 'object'\n    ? (evento.mediaOutputs?.projector?.active ? evento.mediaOutputs.projector : null)\n    : mediaActive;`,
  `  // KADOSH_PROJECTOR_SOURCE_HANDOFF_V1\n  const hasRoutedCanvaOutputs = Boolean(evento?.canvaOutputs && typeof evento.canvaOutputs === 'object');\n  const projectorCanvaRoute = evento?.canvaOutputs?.projector || null;\n  const projectorCanvaUpdatedAt = Number(projectorCanvaRoute?.updatedAt || 0);\n  const projectorMediaUpdatedAt = Number(evento?.mediaOutputs?.projector?.updatedAt || 0);\n  const projectorStateUpdatedAt = Number(evento?.projectorState?.updatedAt || evento?.projectorState?.projectionVersion || 0);\n  const projectorCanvaOwnsOutput = Boolean(\n    projectorCanvaRoute?.active\n    && projectorCanvaRoute?.embedUrl\n    && projectorCanvaUpdatedAt >= Math.max(projectorMediaUpdatedAt, projectorStateUpdatedAt)\n  );\n\n  const projectorPreviewMedia = evento?.mediaOutputs && typeof evento.mediaOutputs === 'object'\n    ? (evento.mediaOutputs?.projector?.active ? evento.mediaOutputs.projector : null)\n    : mediaActive;`,
  'prioridad de fuente en preview del Controlador'
);

replaceExact(
  'controller',
  `(evento?.canvaOutputs?.projector?.active || evento?.projectorState?.contentType === 'canva') ? (`,
  `(projectorCanvaOwnsOutput || (!hasRoutedCanvaOutputs && evento?.projectorState?.contentType === 'canva')) ? (`,
  'preview En Vivo deja de quedar bloqueado por Canva anterior'
);

// 3) Salida pública: resolver la fuente más reciente y limitar el fallback Canva legacy.
replaceExact(
  'projector',
  `  const [canvaOutput, setCanvaOutput] = useState(null);\n  const [hasRoutedMedia, setHasRoutedMedia] = useState(false);`,
  `  const [canvaOutput, setCanvaOutput] = useState(null);\n  const [hasRoutedCanva, setHasRoutedCanva] = useState(false);\n  const [hasRoutedMedia, setHasRoutedMedia] = useState(false);`,
  'estado de enrutamiento Canva en Proyector'
);

replaceExact(
  'projector',
  `        setAnnouncementState(data.announcementState || null);\n        setCanvaOutput(data.canvaOutputs?.projector || null);`,
  `        setAnnouncementState(data.announcementState || null);\n        setHasRoutedCanva(Boolean(data.canvaOutputs && typeof data.canvaOutputs === 'object'));\n        setCanvaOutput(data.canvaOutputs?.projector || null);`,
  'detección de routing Canva en salida pública'
);

replaceExact(
  'projector',
  `  // Permitir renderizar si hay video principal, aunque no haya letras\n  if (apagar) return <div className="fixed inset-0 bg-black animate-in fade-in duration-700"></div>;\n  if (canvaOutput?.active && canvaOutput?.embedUrl) return <InternalScreenCanva state={canvaOutput} label="Canva en proyector" />;`,
  `  // Permitir renderizar si hay video principal, aunque no haya letras\n  const routedCanvaUpdatedAt = Number(canvaOutput?.updatedAt || 0);\n  const routedMediaUpdatedAt = Number(media?.updatedAt || 0);\n  const stateUpdatedAt = Number(projectorState?.updatedAt || projectorState?.projectionVersion || 0);\n  const canvaOwnsProjector = Boolean(\n    canvaOutput?.active\n    && canvaOutput?.embedUrl\n    && routedCanvaUpdatedAt >= Math.max(routedMediaUpdatedAt, stateUpdatedAt)\n  );\n\n  if (apagar) return <div className="fixed inset-0 bg-black animate-in fade-in duration-700"></div>;\n  if (canvaOwnsProjector) return <InternalScreenCanva state={canvaOutput} label="Canva en proyector" />;`,
  'Canva deja paso automáticamente a una fuente más reciente'
);

replaceExact(
  'projector',
  `  const activeCanvaEmbedUrl = projectorState?.contentType === 'canva' ? String(projectorState?.canva?.embedUrl || '') : '';`,
  `  const activeCanvaEmbedUrl = !hasRoutedCanva && projectorState?.contentType === 'canva' ? String(projectorState?.canva?.embedUrl || '') : '';`,
  'fallback Canva legacy aislado del routing nuevo'
);

// 4) Puntos rápidos se comportan igual: toman solo el Proyector, sin tocar retornos.
{
  const file = files.functions;
  const start = file.text.indexOf('exports.projectQuickMessage =');
  const end = file.text.indexOf('exports.clearQuickMessageProjection =', start);
  if (start < 0 || end < 0) throw new Error('No se pudo aislar projectQuickMessage en functions/index.js.');
  let block = file.text.slice(start, end);

  const beforeSnapshot = `    const previousProjectionFields = captureQuickMessagePreviousProjection(eventSnap.data() || {});`;
  const afterSnapshot = `    const currentEventData = eventSnap.data() || {};\n    const previousProjectionFields = captureQuickMessagePreviousProjection(currentEventData);\n    const nextCanvaOutputs = isPlainObject(currentEventData.canvaOutputs) ? { ...currentEventData.canvaOutputs } : {};\n    const nextMediaOutputs = isPlainObject(currentEventData.mediaOutputs) ? { ...currentEventData.mediaOutputs } : {};\n    delete nextCanvaOutputs.projector;\n    delete nextMediaOutputs.projector;`;

  if (!block.includes(afterSnapshot)) {
    if (!block.includes(beforeSnapshot)) throw new Error('No se encontró snapshot previo de projectQuickMessage.');
    block = block.replace(beforeSnapshot, afterSnapshot);
    console.log('[ok] punto rápido prepara handoff del Proyector');
  } else {
    console.log('[skip] punto rápido prepara handoff: ya aplicado.');
  }

  const updateMarker = `    transaction.update(eventRef, {`;
  const updateWithRoutes = `    transaction.update(eventRef, {\n      canvaOutputs: nextCanvaOutputs,\n      mediaOutputs: nextMediaOutputs,`;
  if (!block.includes(updateWithRoutes)) {
    const updateIndex = block.indexOf(updateMarker);
    if (updateIndex < 0) throw new Error('No se encontró transaction.update de projectQuickMessage.');
    block = block.slice(0, updateIndex) + updateWithRoutes + block.slice(updateIndex + updateMarker.length);
    console.log('[ok] punto rápido retira Canva/Media solo del Proyector');
  } else {
    console.log('[skip] handoff del punto rápido: ya aplicado.');
  }

  file.text = file.text.slice(0, start) + block + file.text.slice(end);
}

// 5) Reglas: permitir que una proyección quite rutas existentes sin exigir vaciar todas las salidas.
replaceExact(
  'rules',
  `        && (\n          !changedEventKeys().hasAny(['canvaOutputs'])\n          || (request.resource.data.canvaOutputs is map && request.resource.data.canvaOutputs.keys().size() == 0)\n        )\n        && (\n          !changedEventKeys().hasAny(['mediaOutputs'])\n          || (request.resource.data.mediaOutputs is map && request.resource.data.mediaOutputs.keys().size() == 0)\n        )`,
  `        && (\n          !changedEventKeys().hasAny(['canvaOutputs'])\n          || (request.resource.data.canvaOutputs is map && request.resource.data.canvaOutputs.keys().size() == 0)\n          || (validCanvaOutputsMap() && canvaOutputsOnlyRemove())\n        )\n        && (\n          !changedEventKeys().hasAny(['mediaOutputs'])\n          || (request.resource.data.mediaOutputs is map && request.resource.data.mediaOutputs.keys().size() == 0)\n          || (validMediaOutputsMap() && mediaOutputsOnlyRemove())\n        )`,
  'reglas permiten handoff parcial de rutas'
);

// Validaciones antes de escribir nada.
const controller = files.controller.text;
const projector = files.projector.text;
const fn = files.functions.text;
const rules = files.rules.text;

if (!controller.includes('KADOSH_PROJECTOR_SOURCE_HANDOFF_V1')) throw new Error('Falta marcador de handoff en Controlador.');
if (controller.includes('canvaOutputs: {},\n        mediaOutputs: {},')) throw new Error('Quedó una limpieza global antigua de rutas en Controlador.');
if (!controller.includes("'canvaOutputs.projector': deleteField()") || !controller.includes("'mediaOutputs.projector': deleteField()")) throw new Error('Falta handoff selectivo en Controlador.');
if (!projector.includes('const canvaOwnsProjector = Boolean(')) throw new Error('Falta arbitraje de fuente en Proyector.');
if (!projector.includes("!hasRoutedCanva && projectorState?.contentType === 'canva'")) throw new Error('Fallback legacy Canva no quedó aislado.');
if (!fn.includes('delete nextCanvaOutputs.projector;') || !fn.includes('delete nextMediaOutputs.projector;')) throw new Error('Puntos rápidos no tienen handoff.');
if (!rules.includes('(validCanvaOutputsMap() && canvaOutputsOnlyRemove())')) throw new Error('Reglas no aceptan retiro parcial Canva.');
if (!rules.includes('(validMediaOutputsMap() && mediaOutputsOnlyRemove())')) throw new Error('Reglas no aceptan retiro parcial Media.');

// Escritura al final: si algo anterior falla, no se toca ningún archivo.
for (const [key, filePath] of Object.entries(paths)) {
  const file = files[key];
  fs.writeFileSync(filePath, file.text.replace(/\n/g, file.eol), 'utf8');
}

console.log('[ok] Canva → Biblia/Punto/Canción hace handoff automático del Proyector');
console.log('[ok] Canva de Cantantes/Músicos se conserva');
console.log('[ok] Imagen/Video y Canva usan la misma prioridad por salida');
console.log('[ok] salida pública ignora rutas Canva obsoletas');
console.log('HANDOFF PROYECTOR OK: ya no necesitas pulsar Detener Canva antes de enviar otro contenido.');
