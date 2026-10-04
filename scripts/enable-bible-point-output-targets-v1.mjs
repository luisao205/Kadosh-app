import fs from 'node:fs';

const paths = {
  controller: 'src/components/live/ProyectorController.jsx',
  projector: 'src/components/live/Proyector.jsx',
  singers: 'src/components/live/StageDisplayCantantes.jsx',
  musicians: 'src/components/live/StageDisplayMusicos.jsx',
  quickClient: 'src/utils/quickMessageFunctions.js',
  functions: 'functions/index.js',
  rules: 'firestore.rules',
};

for (const filePath of Object.values(paths)) {
  if (!fs.existsSync(filePath)) throw new Error(`No existe ${filePath}.`);
}

const read = (filePath) => {
  const raw = fs.readFileSync(filePath, 'utf8');
  return { raw, eol: raw.includes('\r\n') ? '\r\n' : '\n', text: raw.replace(/\r\n/g, '\n') };
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

const countOf = (text, needle) => text.split(needle).length - 1;

// ---------------------------------------------------------------------------
// 1) CONTROLADOR: estado + selector compartido para Biblia / Puntos.
// ---------------------------------------------------------------------------
replaceExact(
  'controller',
  `  const [mediaTargets, setMediaTargets] = useState({ projector: true, singers: false, musicians: false });`,
  `  const [mediaTargets, setMediaTargets] = useState({ projector: true, singers: false, musicians: false });\n  // KADOSH_CONTENT_OUTPUT_TARGETS_V1\n  const [contentTargets, setContentTargets] = useState({ projector: true, singers: true, musicians: true });`,
  'estado de destinos para Biblia/Puntos'
);

{
  const file = files.controller;
  if (!file.text.includes('const normalizeContentTargets = (targets = {}) =>')) {
    const anchor = `  const hasMediaTargets = (targets) => Object.values(normalizeMediaTargets(targets)).some(Boolean);`;
    if (!file.text.includes(anchor)) throw new Error('No se encontró hasMediaTargets para insertar destinos de contenido.');
    const addition = `${anchor}\n\n  const normalizeContentTargets = (targets = {}) => ({\n    projector: targets?.projector === true,\n    singers: targets?.singers === true,\n    musicians: targets?.musicians === true,\n  });\n\n  const hasContentTargets = (targets) => Object.values(normalizeContentTargets(targets)).some(Boolean);\n\n  const renderContentTargetSelector = () => {\n    const safeTargets = normalizeContentTargets(contentTargets);\n    const allSelected = safeTargets.projector && safeTargets.singers && safeTargets.musicians;\n    const options = [\n      ['projector', 'Proyector', Monitor],\n      ['singers', 'Cantantes', Type],\n      ['musicians', 'Músicos', Music],\n    ];\n    return (\n      <div className=\"mb-3 rounded-2xl border border-blue-400/20 bg-blue-500/[0.07] p-3\">\n        <div className=\"mb-2 flex items-center justify-between gap-3\">\n          <div>\n            <p className=\"text-[9px] font-black uppercase tracking-[0.2em] text-blue-200\">Destino Biblia / Puntos</p>\n            <p className=\"mt-0.5 text-[9px] font-bold text-zinc-500\">Solo reemplaza el contenido de las pantallas seleccionadas.</p>\n          </div>\n          <button\n            type=\"button\"\n            onClick={() => setContentTargets({ projector: true, singers: true, musicians: true })}\n            className={'shrink-0 rounded-xl border px-3 py-2 text-[9px] font-black uppercase ' + (allSelected ? 'border-blue-200 bg-blue-500 text-white' : 'border-white/10 bg-black/20 text-zinc-300')}\n          >\n            Todas\n          </button>\n        </div>\n        <div className=\"grid grid-cols-3 gap-2\">\n          {options.map(([targetId, label, Icon]) => {\n            const active = safeTargets[targetId];\n            return (\n              <button\n                key={'content-target-' + targetId}\n                type=\"button\"\n                aria-pressed={active}\n                onClick={() => setContentTargets((current) => ({ ...current, [targetId]: !current[targetId] }))}\n                className={'min-h-10 rounded-xl border px-2 py-2 text-[9px] font-black uppercase transition-all ' + (active ? 'border-blue-200 bg-blue-600 text-white' : 'border-white/10 bg-black/20 text-zinc-500')}\n              >\n                <span className=\"flex items-center justify-center gap-1.5\"><Icon size={13} /> {label}</span>\n              </button>\n            );\n          })}\n        </div>\n      </div>\n    );\n  };`;
    file.text = file.text.replace(anchor, addition);
    console.log('[ok] selector compartido Biblia/Puntos');
  } else {
    console.log('[skip] selector compartido Biblia/Puntos: ya aplicado.');
  }
}

// Mostrar el selector tanto en Biblia desktop como móvil.
{
  const file = files.controller;
  if (!file.text.includes('KADOSH_BIBLE_TARGET_SELECTOR_DESKTOP_V1')) {
    const desktop = `                {bibleOutlinePanel}`;
    const mobile = `            {bibleOutlinePanel}`;
    if (!file.text.includes(desktop) || !file.text.includes(mobile)) {
      throw new Error('No se encontraron ambos puntos de montaje de bibleOutlinePanel.');
    }
    file.text = file.text.replace(desktop, `                {/* KADOSH_BIBLE_TARGET_SELECTOR_DESKTOP_V1 */}\n                {renderContentTargetSelector()}\n                {bibleOutlinePanel}`);
    file.text = file.text.replace(mobile, `            {/* KADOSH_BIBLE_TARGET_SELECTOR_MOBILE_V1 */}\n            {renderContentTargetSelector()}\n            {bibleOutlinePanel}`);
    console.log('[ok] selector visible en Biblia PC y móvil');
  } else {
    console.log('[skip] selector visible en Biblia PC y móvil: ya aplicado.');
  }
}

// ---------------------------------------------------------------------------
// 2) Biblia: quitar Canva/Media únicamente de destinos seleccionados.
// ---------------------------------------------------------------------------
{
  const file = files.controller;
  const start = file.text.indexOf('  const projectBiblePassage = async');
  const end = file.text.indexOf('  const openBibleOutlinePicker =', start);
  if (start < 0 || end < 0) throw new Error('No se pudo aislar projectBiblePassage.');
  let block = file.text.slice(start, end);

  if (!block.includes('const safeContentTargets = normalizeContentTargets(contentTargets);')) {
    const guard = `    if (!passage) return;`;
    if (!block.includes(guard)) throw new Error('No se encontró guard de passage en projectBiblePassage.');
    block = block.replace(guard, `${guard}\n    const safeContentTargets = normalizeContentTargets(contentTargets);\n    if (!hasContentTargets(safeContentTargets)) {\n      notify('Selecciona al menos una pantalla para Biblia.', { type: 'error' });\n      return;\n    }`);
    console.log('[ok] Biblia valida destinos seleccionados');
  }

  if (!block.includes('const nextCanvaOutputs = { ...(eventData.canvaOutputs || {}) };')) {
    const snapshotLine = `        const previousProjectionFields = capturePreviousProjectionFields(eventSnapshot.data());`;
    if (!block.includes(snapshotLine)) throw new Error('No se encontró snapshot previo de Biblia.');
    const prep = `        const eventData = eventSnapshot.data();\n        const nextCanvaOutputs = { ...(eventData.canvaOutputs || {}) };\n        const nextMediaOutputs = { ...(eventData.mediaOutputs || {}) };\n        ['projector', 'singers', 'musicians'].forEach((targetId) => {\n          if (!safeContentTargets[targetId]) return;\n          delete nextCanvaOutputs[targetId];\n          delete nextMediaOutputs[targetId];\n        });\n        const previousProjectionFields = capturePreviousProjectionFields(eventData);`;
    block = block.replace(snapshotLine, prep);
    console.log('[ok] Biblia prepara handoff por pantalla');
  }

  const selective = `        canvaOutputs: nextCanvaOutputs,\n        mediaOutputs: nextMediaOutputs,\n        projectionTargets: safeContentTargets,`;
  if (!block.includes(selective)) {
    const handoffV1 = `        'canvaOutputs.projector': deleteField(),\n        'mediaOutputs.projector': deleteField(),`;
    const legacy = `        canvaOutputs: {},\n        mediaOutputs: {},`;
    if (block.includes(handoffV1)) block = block.replace(handoffV1, selective);
    else if (block.includes(legacy)) block = block.replace(legacy, selective);
    else throw new Error('No se encontró el handoff actual dentro de projectBiblePassage.');
    console.log('[ok] Biblia retira rutas solo de destinos seleccionados');
  }

  file.text = file.text.slice(0, start) + block + file.text.slice(end);
}

// ---------------------------------------------------------------------------
// 3) Punto rápido: mandar los mismos destinos al backend.
// ---------------------------------------------------------------------------
{
  const file = files.controller;
  const start = file.text.indexOf('  const projectQuickMessage = async');
  const end = file.text.indexOf('  const updateQuickMessageHistory = async', start);
  if (start < 0 || end < 0) throw new Error('No se pudo aislar projectQuickMessage en Controlador.');
  let block = file.text.slice(start, end);

  if (!block.includes('const safeContentTargets = normalizeContentTargets(contentTargets);')) {
    const guard = `    if (!canQuickProject) return null;`;
    if (!block.includes(guard)) throw new Error('No se encontró guard de projectQuickMessage.');
    block = block.replace(guard, `${guard}\n    const safeContentTargets = normalizeContentTargets(contentTargets);\n    if (!hasContentTargets(safeContentTargets)) {\n      notify('Selecciona al menos una pantalla para el Punto.', { type: 'error' });\n      return null;\n    }`);
  }

  const oldCall = `        historyEntryId\n      }));`;
  const newCall = `        historyEntryId,\n        targets: safeContentTargets\n      }));`;
  if (!block.includes(newCall)) {
    if (!block.includes(oldCall)) throw new Error('No se encontró llamada a requestQuickMessageProjection.');
    block = block.replace(oldCall, newCall);
  }

  file.text = file.text.slice(0, start) + block + file.text.slice(end);
  console.log('[ok] Puntos usan los destinos seleccionados');
}

// ---------------------------------------------------------------------------
// 4) Preview del Controlador: una proyección dirigida a otra pantalla no roba Proyector.
// ---------------------------------------------------------------------------
{
  const file = files.controller;
  if (file.text.includes('KADOSH_PROJECTOR_SOURCE_HANDOFF_V1') && !file.text.includes('const projectorStateUsesOutputTargets =')) {
    const before = `  const projectorStateUpdatedAt = Number(evento?.projectorState?.updatedAt || evento?.projectorState?.projectionVersion || 0);`;
    const after = `  const projectorStateUsesOutputTargets = Boolean(\n    evento?.projectorState?.contentType === 'bible'\n    || evento?.projectorState?.contentType === 'quickMessage'\n    || evento?.projectorState?.type === 'quickMessage'\n  );\n  const projectorStateTargetsProjector = !projectorStateUsesOutputTargets || evento?.projectionTargets?.projector !== false;\n  const projectorStateUpdatedAt = projectorStateTargetsProjector\n    ? Number(evento?.projectorState?.updatedAt || evento?.projectorState?.projectionVersion || 0)\n    : 0;`;
    if (!file.text.includes(before)) throw new Error('No se encontró arbitraje de fuente del preview.');
    file.text = file.text.replace(before, after);
    console.log('[ok] preview respeta destino Proyector');
  }
}

// ---------------------------------------------------------------------------
// 5) Cliente callable de Puntos: aceptar targets.
// ---------------------------------------------------------------------------
replaceExact(
  'quickClient',
  `export const projectQuickMessage = async ({ eventoId, presentationType, segments, historyEntryId = null }) => {\n  const payload = { eventoId, presentationType, segments };\n  if (historyEntryId) payload.historyEntryId = historyEntryId;`,
  `export const projectQuickMessage = async ({ eventoId, presentationType, segments, historyEntryId = null, targets = null }) => {\n  const payload = { eventoId, presentationType, segments };\n  if (historyEntryId) payload.historyEntryId = historyEntryId;\n  if (targets) payload.targets = targets;`,
  'cliente de Puntos acepta destinos'
);

// ---------------------------------------------------------------------------
// 6) Cloud Function: validar targets y retirar rutas selectivamente.
// ---------------------------------------------------------------------------
{
  const file = files.functions;
  if (!file.text.includes('const normalizeProjectionTargets = (value) =>')) {
    const anchor = `const assertQuickMessagePayload = (data) => {`;
    if (!file.text.includes(anchor)) throw new Error('No se encontró assertQuickMessagePayload.');
    const helper = `const normalizeProjectionTargets = (value) => {\n  const source = isPlainObject(value) ? value : { projector: true, singers: true, musicians: true };\n  const targets = {\n    projector: source.projector === true,\n    singers: source.singers === true,\n    musicians: source.musicians === true\n  };\n  if (!targets.projector && !targets.singers && !targets.musicians) {\n    throw new functions.https.HttpsError(\"invalid-argument\", \"Selecciona al menos una pantalla.\");\n  }\n  return targets;\n};\n\n`;
    file.text = file.text.replace(anchor, helper + anchor);
    console.log('[ok] backend valida destinos de Puntos');
  }

  const startAssert = file.text.indexOf('const assertQuickMessagePayload = (data) => {');
  const endAssert = file.text.indexOf('\n};', startAssert) + 3;
  if (startAssert < 0 || endAssert < 3) throw new Error('No se pudo aislar assertQuickMessagePayload.');
  let assertBlock = file.text.slice(startAssert, endAssert);
  if (!assertBlock.includes('const targets = normalizeProjectionTargets(payload.targets);')) {
    const before = `  if (isPlainObject(payload)) delete payload.historyEntryId;`;
    const after = `  const targets = normalizeProjectionTargets(isPlainObject(payload) ? payload.targets : null);\n  if (isPlainObject(payload)) {\n    delete payload.historyEntryId;\n    delete payload.targets;\n  }`;
    if (!assertBlock.includes(before)) throw new Error('No se encontró limpieza de historyEntryId.');
    assertBlock = assertBlock.replace(before, after);
    assertBlock = assertBlock.replace(
      `    return { ...validateQuickMessagePayload(payload), historyEntryId };`,
      `    return { ...validateQuickMessagePayload(payload), historyEntryId, targets };`
    );
    file.text = file.text.slice(0, startAssert) + assertBlock + file.text.slice(endAssert);
  }

  const start = file.text.indexOf('exports.projectQuickMessage =');
  const end = file.text.indexOf('exports.clearQuickMessageProjection =', start);
  if (start < 0 || end < 0) throw new Error('No se pudo aislar projectQuickMessage backend.');
  let block = file.text.slice(start, end);

  const oldDeletes = `    delete nextCanvaOutputs.projector;\n    delete nextMediaOutputs.projector;`;
  const selectiveDeletes = `    ['projector', 'singers', 'musicians'].forEach((targetId) => {\n      if (!message.targets[targetId]) return;\n      delete nextCanvaOutputs[targetId];\n      delete nextMediaOutputs[targetId];\n    });`;
  if (!block.includes(selectiveDeletes)) {
    if (!block.includes(oldDeletes)) throw new Error('No se encontró handoff previo del Punto rápido. Aplica primero fix-projector-source-handoff-over-canva.mjs.');
    block = block.replace(oldDeletes, selectiveDeletes);
  }

  const routeUpdate = `      canvaOutputs: nextCanvaOutputs,\n      mediaOutputs: nextMediaOutputs,`;
  const routeWithTargets = `      canvaOutputs: nextCanvaOutputs,\n      mediaOutputs: nextMediaOutputs,\n      projectionTargets: message.targets,`;
  if (!block.includes(routeWithTargets)) {
    if (!block.includes(routeUpdate)) throw new Error('No se encontró update de rutas en Punto rápido.');
    block = block.replace(routeUpdate, routeWithTargets);
  }

  file.text = file.text.slice(0, start) + block + file.text.slice(end);
  console.log('[ok] backend de Puntos hace handoff solo en pantallas seleccionadas');
}

// ---------------------------------------------------------------------------
// 7) Cantantes/Músicos: Biblia y Punto solo se dibujan si esa salida fue elegida.
// ---------------------------------------------------------------------------
for (const [key, targetKey, label] of [
  ['singers', 'singers', 'Cantantes'],
  ['musicians', 'musicians', 'Músicos'],
]) {
  const file = files[key];
  const marker = `KADOSH_TARGETED_BIBLE_POINT_${targetKey.toUpperCase()}_V1`;
  if (!file.text.includes(marker)) {
    const quick = `      <QuickMessagePresentation eventData={evento} layerClassName=\"z-[75]\" />`;
    const bible = `      <InternalScreenBible eventData={evento} />`;
    if (!file.text.includes(quick) || !file.text.includes(bible)) throw new Error(`No se encontraron overlays de ${label}.`);
    const condition = `evento?.projectionTargets?.${targetKey} !== false`;
    file.text = file.text.replace(quick, `      {/* ${marker} */}\n      {${condition} && <QuickMessagePresentation eventData={evento} layerClassName=\"z-[75]\" />}`);
    file.text = file.text.replace(bible, `      {${condition} && <InternalScreenBible eventData={evento} />}`);
    console.log(`[ok] ${label} respeta destinos de Biblia/Puntos`);
  }
}

// ---------------------------------------------------------------------------
// 8) Proyector público: respetar target y no dejar que estado de otra salida mate su Canva.
// ---------------------------------------------------------------------------
replaceExact(
  'projector',
  `  const [canvaOutput, setCanvaOutput] = useState(null);\n  const [hasRoutedCanva, setHasRoutedCanva] = useState(false);`,
  `  const [canvaOutput, setCanvaOutput] = useState(null);\n  const [projectionTargets, setProjectionTargets] = useState(null);\n  const [hasRoutedCanva, setHasRoutedCanva] = useState(false);`,
  'estado de destinos en Proyector'
);

replaceExact(
  'projector',
  `        setProjectorState(data.projectorState || null);\n        setAnnouncementState(data.announcementState || null);`,
  `        setProjectorState(data.projectorState || null);\n        setProjectionTargets(data.projectionTargets || null);\n        setAnnouncementState(data.announcementState || null);`,
  'snapshot de destinos en Proyector'
);

{
  const file = files.projector;
  if (!file.text.includes('const projectorStateUsesOutputTargets = Boolean(')) {
    const before = `  const stateUpdatedAt = Number(projectorState?.updatedAt || projectorState?.projectionVersion || 0);`;
    const after = `  const projectorStateUsesOutputTargets = Boolean(\n    projectorState?.contentType === 'bible'\n    || projectorState?.contentType === 'quickMessage'\n    || projectorState?.type === 'quickMessage'\n  );\n  const projectorReceivesTargetedContent = !projectorStateUsesOutputTargets || projectionTargets?.projector !== false;\n  const stateUpdatedAt = projectorReceivesTargetedContent\n    ? Number(projectorState?.updatedAt || projectorState?.projectionVersion || 0)\n    : 0;`;
    if (!file.text.includes(before)) throw new Error('No se encontró stateUpdatedAt en Proyector; aplica primero handoff Canva.');
    file.text = file.text.replace(before, after);
  }

  file.text = file.text.replace(
    `  const activeBibleState = resolveActiveBibleProjectorState({ projectorState, proyectorApagado: apagar });`,
    `  const activeBibleState = projectorReceivesTargetedContent\n    ? resolveActiveBibleProjectorState({ projectorState, proyectorApagado: apagar })\n    : null;`
  );
  file.text = file.text.replace(
    `  const activeQuickMessageState = resolveActiveQuickMessageProjectorState({ projectorState, proyectorApagado: apagar });`,
    `  const activeQuickMessageState = projectorReceivesTargetedContent\n    ? resolveActiveQuickMessageProjectorState({ projectorState, proyectorApagado: apagar })\n    : null;`
  );
  console.log('[ok] Proyector respeta destinos de Biblia/Puntos');
}

// ---------------------------------------------------------------------------
// 9) Reglas Firestore: projectionTargets es un mapa estricto de booleanos.
// ---------------------------------------------------------------------------
{
  const file = files.rules;
  if (!file.text.includes('function validProjectionTargetsMap()')) {
    const anchor = `    function canUpdateEventAsMedia() {`;
    if (!file.text.includes(anchor)) throw new Error('No se encontró canUpdateEventAsMedia en reglas.');
    const helper = `    function validProjectionTargetsMap() {\n      let targets = request.resource.data.projectionTargets;\n      return targets is map\n        && targets.keys().hasOnly(['projector', 'singers', 'musicians'])\n        && targets.keys().hasAll(['projector', 'singers', 'musicians'])\n        && targets.projector is bool\n        && targets.singers is bool\n        && targets.musicians is bool\n        && (targets.projector == true || targets.singers == true || targets.musicians == true);\n    }\n\n`;
    file.text = file.text.replace(anchor, helper + anchor);
  }

  // Añadir campo permitido en bibleProjectionFields.
  const bibleFieldsBefore = `'liveState', 'currentSongId', 'canvaOutputs', 'mediaOutputs', 'announcementState'];`;
  const bibleFieldsAfter = `'liveState', 'currentSongId', 'canvaOutputs', 'mediaOutputs', 'announcementState', 'projectionTargets'];`;
  if (!file.text.includes(bibleFieldsAfter)) {
    if (!file.text.includes(bibleFieldsBefore)) throw new Error('No se encontró bibleProjectionFields para projectionTargets.');
    file.text = file.text.replace(bibleFieldsBefore, bibleFieldsAfter);
  }

  // Añadir a projectorEventFields sin depender del formato completo de la función.
  const eventStart = file.text.indexOf('    function projectorEventFields()');
  const eventEnd = file.text.indexOf('    }', eventStart);
  if (eventStart < 0 || eventEnd < 0) throw new Error('No se encontró projectorEventFields.');
  let eventBlock = file.text.slice(eventStart, eventEnd + 5);
  if (!eventBlock.includes("'projectionTargets'")) {
    const close = `        'announcementState'\n      ];`;
    if (!eventBlock.includes(close)) throw new Error('No se encontró cierre de projectorEventFields.');
    eventBlock = eventBlock.replace(close, `        'announcementState',\n        'projectionTargets'\n      ];`);
    file.text = file.text.slice(0, eventStart) + eventBlock + file.text.slice(eventEnd + 5);
  }

  // canUpdateEventAsMedia debe validar el mapa cuando cambia.
  const mediaStart = file.text.indexOf('    function canUpdateEventAsMedia()');
  const mediaEnd = file.text.indexOf('    }', mediaStart);
  if (mediaStart < 0 || mediaEnd < 0) throw new Error('No se pudo aislar canUpdateEventAsMedia.');
  let mediaBlock = file.text.slice(mediaStart, mediaEnd + 5);
  if (!mediaBlock.includes("changedEventKeys().hasAny(['projectionTargets'])")) {
    const needle = `        && onlyEventKeys(projectorEventFields())`;
    if (!mediaBlock.includes(needle)) throw new Error('No se encontró onlyEventKeys en canUpdateEventAsMedia.');
    mediaBlock = mediaBlock.replace(needle, `${needle}\n        && (!changedEventKeys().hasAny(['projectionTargets']) || validProjectionTargetsMap())`);
    file.text = file.text.slice(0, mediaStart) + mediaBlock + file.text.slice(mediaEnd + 5);
  }

  console.log('[ok] reglas aceptan destinos estrictos de Biblia/Puntos');
}

// ---------------------------------------------------------------------------
// Validación global antes de escribir.
// ---------------------------------------------------------------------------
const mustHave = [
  ['controller', 'KADOSH_CONTENT_OUTPUT_TARGETS_V1'],
  ['controller', 'projectionTargets: safeContentTargets'],
  ['quickClient', 'if (targets) payload.targets = targets;'],
  ['functions', 'projectionTargets: message.targets'],
  ['singers', 'KADOSH_TARGETED_BIBLE_POINT_SINGERS_V1'],
  ['musicians', 'KADOSH_TARGETED_BIBLE_POINT_MUSICIANS_V1'],
  ['projector', 'projectorReceivesTargetedContent'],
  ['rules', 'function validProjectionTargetsMap()'],
  ['rules', "'projectionTargets'"],
];
for (const [key, needle] of mustHave) {
  if (!files[key].text.includes(needle)) throw new Error(`Validación final falló en ${key}: falta ${needle}`);
}

if (countOf(files.controller.text, 'KADOSH_BIBLE_TARGET_SELECTOR_DESKTOP_V1') !== 1) throw new Error('Selector Biblia desktop duplicado o ausente.');
if (countOf(files.controller.text, 'KADOSH_BIBLE_TARGET_SELECTOR_MOBILE_V1') !== 1) throw new Error('Selector Biblia móvil duplicado o ausente.');

// Escritura al final: si algo falla antes, no muta ningún archivo.
for (const [key, filePath] of Object.entries(paths)) {
  const file = files[key];
  fs.writeFileSync(filePath, file.text.replace(/\n/g, file.eol), 'utf8');
}

console.log('[ok] Biblia puede ir a Proyector/Cantantes/Músicos/Todas');
console.log('[ok] Puntos del mensaje usan los mismos destinos');
console.log('[ok] Canva/Multimedia solo se retiran en las pantallas elegidas');
console.log('[ok] las salidas no elegidas conservan su Canva/Media');
console.log('ROUTING BIBLIA/PUNTOS V1 OK: selecciona pantallas antes de proyectar; TODAS queda disponible con un toque.');
