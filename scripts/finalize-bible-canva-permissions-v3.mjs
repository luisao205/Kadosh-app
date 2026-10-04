import fs from 'node:fs';

const paths = {
  controller: 'src/components/live/ProyectorController.jsx',
  permissions: 'src/utils/permissions.js',
  presets: 'src/utils/permissionPresets.js',
  functions: 'functions/index.js',
  rules: 'firestore.rules',
};

for (const filePath of Object.values(paths)) {
  if (!fs.existsSync(filePath)) throw new Error(`No existe ${filePath}.`);
}

const snapshots = new Map(Object.values(paths).map((filePath) => [filePath, fs.readFileSync(filePath)]));
const restoreAll = () => {
  for (const [filePath, bytes] of snapshots.entries()) fs.writeFileSync(filePath, bytes);
};
const read = (filePath) => {
  const raw = fs.readFileSync(filePath, 'utf8');
  return { eol: raw.includes('\r\n') ? '\r\n' : '\n', text: raw.replace(/\r\n/g, '\n') };
};
const files = Object.fromEntries(Object.entries(paths).map(([key, filePath]) => [key, read(filePath)]));
const writeAll = () => {
  for (const [key, filePath] of Object.entries(paths)) {
    fs.writeFileSync(filePath, files[key].text.replace(/\n/g, files[key].eol), 'utf8');
  }
};
const count = (text, needle) => text.split(needle).length - 1;

try {
  const controller = files.controller;

  if (!controller.text.includes('KADOSH_CONTENT_OUTPUT_TARGETS_V1')) {
    throw new Error('Primero debe estar aplicado el routing Biblia/Puntos V1/V2.');
  }
  if (!controller.text.includes('KADOSH_BIBLE_DESKTOP_SPLIT_V1')) {
    throw new Error('No se encontró la división Biblia/Puntos de escritorio.');
  }
  if (!controller.text.includes('        setlistId: eventoId,')) {
    throw new Error('Primero debe estar aplicado Canva por setlist V2.');
  }

  // 1) Biblia/Puntos: quitar montajes duplicados creados por el reemplazo de indentación V1.
  const selectorMountRegex = /^[ \t]*\{\/\* KADOSH_BIBLE_TARGET_SELECTOR_(?:DESKTOP|MOBILE)_V1 \*\/\}\n[ \t]*\{renderContentTargetSelector\(\)\}\n/gm;
  const mountMatches = controller.text.match(selectorMountRegex) || [];
  controller.text = controller.text.replace(selectorMountRegex, '');
  if (!mountMatches.length && !controller.text.includes('KADOSH_BIBLE_TARGET_SELECTOR_DESKTOP_V2')) {
    throw new Error('No se encontraron los montajes antiguos de destinos Biblia/Puntos.');
  }

  // 2) Estado y renderer compacto exclusivo para móvil.
  const contentTargetState = "  const [contentTargets, setContentTargets] = useState({ projector: true, singers: true, musicians: true });";
  const mobileState = "  const [showMobileContentTargets, setShowMobileContentTargets] = useState(false);";
  if (!controller.text.includes(mobileState)) {
    if (!controller.text.includes(contentTargetState)) throw new Error('No se encontró el estado contentTargets.');
    controller.text = controller.text.replace(contentTargetState, `${contentTargetState}\n${mobileState}`);
  }

  if (!controller.text.includes('const renderMobileContentTargetSelector = () => {')) {
    const rendererStart = controller.text.indexOf('  const renderContentTargetSelector = () => {');
    if (rendererStart < 0) throw new Error('No se encontró renderContentTargetSelector.');
    const rendererEnd = controller.text.indexOf('\n  };', rendererStart);
    if (rendererEnd < 0) throw new Error('No se pudo aislar renderContentTargetSelector.');
    const insertAt = rendererEnd + '\n  };'.length;
    const mobileRenderer = `\n\n  const renderMobileContentTargetSelector = () => {\n    const safeTargets = normalizeContentTargets(contentTargets);\n    const activeLabels = [\n      safeTargets.projector ? 'PROY' : '',\n      safeTargets.singers ? 'CANT' : '',\n      safeTargets.musicians ? 'MÚS' : '',\n    ].filter(Boolean);\n    const allSelected = activeLabels.length === 3;\n    return (\n      <div className=\"mb-3 rounded-2xl border border-blue-400/20 bg-blue-500/[0.07] p-3\">\n        <div className=\"flex items-center justify-between gap-3\">\n          <div className=\"min-w-0\">\n            <p className=\"text-[9px] font-black uppercase tracking-[0.18em] text-blue-200\">Destino Biblia / Puntos</p>\n            <p className=\"mt-1 truncate text-[9px] font-bold text-zinc-500\">{allSelected ? 'TODAS' : (activeLabels.join(' · ') || 'NINGUNA')}</p>\n          </div>\n          <button type=\"button\" onClick={() => setShowMobileContentTargets((current) => !current)} className=\"shrink-0 rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-[9px] font-black uppercase text-zinc-200\">\n            {showMobileContentTargets ? 'Cerrar' : 'Cambiar'}\n          </button>\n        </div>\n        {showMobileContentTargets && (\n          <div className=\"mt-3 border-t border-white/10 pt-3\">\n            <div className=\"grid grid-cols-3 gap-2\">\n              {[['projector', 'Proyector', Monitor], ['singers', 'Cantantes', Type], ['musicians', 'Músicos', Music]].map(([targetId, label, Icon]) => {\n                const active = safeTargets[targetId];\n                return (\n                  <button key={'mobile-content-' + targetId} type=\"button\" aria-pressed={active} onClick={() => setContentTargets((current) => ({ ...current, [targetId]: !current[targetId] }))} className={'min-h-11 rounded-xl border px-1 text-[8px] font-black uppercase ' + (active ? 'border-blue-200 bg-blue-600 text-white' : 'border-white/10 bg-black/20 text-zinc-500')}>\n                    <Icon size={13} className=\"mx-auto mb-1\" />{label}\n                  </button>\n                );\n              })}\n            </div>\n            <button type=\"button\" onClick={() => setContentTargets({ projector: true, singers: true, musicians: true })} className={'mt-2 min-h-10 w-full rounded-xl border text-[9px] font-black uppercase ' + (allSelected ? 'border-blue-200 bg-blue-500 text-white' : 'border-white/10 bg-black/20 text-zinc-300')}>Todas</button>\n          </div>\n        )}\n      </div>\n    );\n  };`;
    controller.text = controller.text.slice(0, insertAt) + mobileRenderer + controller.text.slice(insertAt);
  }

  // 3) Montar una sola vez en PC y una sola vez, compacta, en móvil.
  const mobileViewMarker = '      {/* VISTA MÓVIL';
  const mobileViewIndex = controller.text.indexOf(mobileViewMarker);
  if (mobileViewIndex < 0) throw new Error('No se encontró el inicio de la vista móvil.');

  let desktopPart = controller.text.slice(0, mobileViewIndex);
  let mobilePart = controller.text.slice(mobileViewIndex);

  if (!desktopPart.includes('KADOSH_BIBLE_TARGET_SELECTOR_DESKTOP_V2')) {
    const desktopPanelNeedle = '                {bibleOutlinePanel}';
    if (count(desktopPart, desktopPanelNeedle) !== 1) {
      throw new Error(`Se esperó un bibleOutlinePanel desktop y se encontraron ${count(desktopPart, desktopPanelNeedle)}.`);
    }
    desktopPart = desktopPart.replace(
      desktopPanelNeedle,
      `                {/* KADOSH_BIBLE_TARGET_SELECTOR_DESKTOP_V2 */}\n                {renderContentTargetSelector()}\n                {bibleOutlinePanel}`
    );
  }

  if (!mobilePart.includes('KADOSH_BIBLE_TARGET_SELECTOR_MOBILE_V2')) {
    const mobilePanelNeedle = '            {bibleOutlinePanel}';
    if (count(mobilePart, mobilePanelNeedle) !== 1) {
      throw new Error(`Se esperó un bibleOutlinePanel móvil y se encontraron ${count(mobilePart, mobilePanelNeedle)}.`);
    }
    mobilePart = mobilePart.replace(
      mobilePanelNeedle,
      `            {/* KADOSH_BIBLE_TARGET_SELECTOR_MOBILE_V2 */}\n            {renderMobileContentTargetSelector()}\n            {bibleOutlinePanel}`
    );
  }
  controller.text = desktopPart + mobilePart;

  // 4) Canva estrictamente por setlist: los documentos legacy sin setlistId ya no aparecen en todos.
  const legacyScopedLibrary = `      const presentations = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));\n      const scoped = presentations.filter((item) => item.setlistId === eventoId);\n      const legacyUnassigned = presentations.filter((item) => !item.setlistId);\n      setCanvaLibrary([...scoped, ...legacyUnassigned]);`;
  const strictScopedLibrary = `      const presentations = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));\n      setCanvaLibrary(presentations.filter((item) => item.setlistId === eventoId));`;
  if (!controller.text.includes(strictScopedLibrary)) {
    if (!controller.text.includes(legacyScopedLibrary)) throw new Error('No se encontró el filtro Canva V2 para hacerlo estricto.');
    controller.text = controller.text.replace(legacyScopedLibrary, strictScopedLibrary);
  }

  // No reclamar presentaciones legacy desde otro setlist; solo aceptar las que ya pertenecen al actual.
  const legacyClaim = `    if (item.setlistId && item.setlistId !== eventoId) {\n      notify('Esta presentación Canva pertenece a otro setlist.', { type: 'error' });\n      return;\n    }\n    if (!item.setlistId) {\n      const now = Date.now();\n      await setDoc(doc(db, 'canvaPresentations', item.id), {\n        setlistId: eventoId,\n        updatedAt: now,\n        updatedBy: user?.uid || ''\n      }, { merge: true });\n      item = { ...item, setlistId: eventoId, updatedAt: now, updatedBy: user?.uid || '' };\n    }`;
  const strictGuard = `    if (item.setlistId !== eventoId) {\n      notify('Esta presentación Canva no pertenece a este setlist.', { type: 'error' });\n      return;\n    }`;
  if (!controller.text.includes(strictGuard)) {
    if (!controller.text.includes(legacyClaim)) throw new Error('No se encontró la adopción Canva legacy de V2.');
    controller.text = controller.text.replace(legacyClaim, strictGuard);
  }

  // Al cambiar de setlist no conservar selección/editor de Canva del evento anterior.
  const resetAnchor = `    setMediaTargets({ projector: true, singers: false, musicians: false });`;
  const resetBlock = `    setMediaTargets({ projector: true, singers: false, musicians: false });\n    setSelectedCanvaId('');\n    setCanvaDraft({ title: 'Presentación Canva', url: '' });\n    setCanvaPreviewUrl('');\n    setCanvaUrlError('');\n    setCanvaTargets({ projector: true, singers: false, musicians: false });\n    setCanvaPage(1);\n    setCanvaPageCount(0);\n    setCanvaPageWindowStart(1);`;
  if (!controller.text.includes(resetBlock)) {
    if (count(controller.text, resetAnchor) !== 1) throw new Error('No se pudo ubicar el reset de evento para Canva.');
    controller.text = controller.text.replace(resetAnchor, resetBlock);
  }

  // 5) Multimedia: completar defaults fuente con TODO el grupo multimedia, incluido eliminar.
  const permissions = files.permissions;
  const permissionBefore = 'PERMISSIONS.MULTIMEDIA_UPLOAD, PERMISSIONS.MULTIMEDIA_EDIT, PERMISSIONS.MULTIMEDIA_CENTRAL_ACCESS';
  const permissionAfter = 'PERMISSIONS.MULTIMEDIA_UPLOAD, PERMISSIONS.MULTIMEDIA_EDIT, PERMISSIONS.MULTIMEDIA_DELETE, PERMISSIONS.MULTIMEDIA_CENTRAL_ACCESS';
  if (!permissions.text.includes(permissionAfter)) {
    const hits = count(permissions.text, permissionBefore);
    if (hits < 2) throw new Error('No se encontraron defaults Admin/Multimedia para agregar multimedia.delete.');
    permissions.text = permissions.text.replaceAll(permissionBefore, permissionAfter);
  }

  const presets = files.presets;
  const presetBefore = `  PERMISSIONS.MULTIMEDIA_UPLOAD,\n  PERMISSIONS.MULTIMEDIA_EDIT,\n  PERMISSIONS.MULTIMEDIA_CENTRAL_ACCESS,`;
  const presetAfter = `  PERMISSIONS.MULTIMEDIA_UPLOAD,\n  PERMISSIONS.MULTIMEDIA_EDIT,\n  PERMISSIONS.MULTIMEDIA_DELETE,\n  PERMISSIONS.MULTIMEDIA_CENTRAL_ACCESS,`;
  if (!presets.text.includes(presetAfter)) {
    if (!presets.text.includes(presetBefore)) throw new Error('No se encontró preset Multimedia completo.');
    presets.text = presets.text.replace(presetBefore, presetAfter);
  }

  // 6) Backend de permisos: el catálogo debe aceptar los permisos que la UI realmente envía.
  const functionsFile = files.functions;
  const sermonsBefore = '  "sermons.view", "sermons.create", "sermons.edit", "sermons.delete", "sermons.project",';
  const sermonsAfter = '  "sermons.view", "sermons.create", "sermons.edit", "sermons.createPoint", "sermons.createBiblePassage", "sermons.delete", "sermons.project",';
  if (!functionsFile.text.includes(sermonsAfter)) {
    if (!functionsFile.text.includes(sermonsBefore)) throw new Error('No se encontró catálogo de permisos de Prédicas.');
    functionsFile.text = functionsFile.text.replace(sermonsBefore, sermonsAfter);
  }
  const multimediaCatalog = '  "multimedia.libraryView", "multimedia.upload", "multimedia.edit", "multimedia.delete", "multimedia.centralAccess", "multimedia.controlOutputs", "multimedia.project",';
  const canvaCatalog = '  "canva.view", "canva.create", "canva.edit", "canva.delete", "canva.project",';
  if (!functionsFile.text.includes(canvaCatalog)) {
    if (!functionsFile.text.includes(multimediaCatalog)) throw new Error('No se encontró catálogo Multimedia para insertar Canva.');
    functionsFile.text = functionsFile.text.replace(multimediaCatalog, `${multimediaCatalog}\n${canvaCatalog}`);
  }

  // 7) Reglas: fallback del rol Multimedia/Admin incluye también eliminar Multimedia.
  const rules = files.rules;
  const rulesBefore = "'multimedia.libraryView', 'multimedia.upload', 'multimedia.edit', 'multimedia.centralAccess', 'multimedia.controlOutputs', 'multimedia.project'";
  const rulesAfter = "'multimedia.libraryView', 'multimedia.upload', 'multimedia.edit', 'multimedia.delete', 'multimedia.centralAccess', 'multimedia.controlOutputs', 'multimedia.project'";
  if (!rules.text.includes(rulesAfter)) {
    const hits = count(rules.text, rulesBefore);
    if (hits < 2) throw new Error('No se encontraron fallbacks Admin/Multimedia de Firestore.');
    rules.text = rules.text.replaceAll(rulesBefore, rulesAfter);
  }

  // Validaciones finales antes de escribir.
  if (count(controller.text, 'KADOSH_BIBLE_TARGET_SELECTOR_DESKTOP_V2') !== 1) throw new Error('Debe existir un solo selector desktop Biblia/Puntos.');
  if (count(controller.text, 'KADOSH_BIBLE_TARGET_SELECTOR_MOBILE_V2') !== 1) throw new Error('Debe existir un solo selector móvil Biblia/Puntos.');
  if (controller.text.includes('KADOSH_BIBLE_TARGET_SELECTOR_DESKTOP_V1') || controller.text.includes('KADOSH_BIBLE_TARGET_SELECTOR_MOBILE_V1')) throw new Error('Quedaron montajes V1 de destinos.');
  if (!controller.text.includes('renderMobileContentTargetSelector()')) throw new Error('Falta selector compacto móvil.');
  if (controller.text.includes('legacyUnassigned')) throw new Error('Canva legacy todavía se está mostrando globalmente.');
  if (!controller.text.includes('setCanvaLibrary(presentations.filter((item) => item.setlistId === eventoId));')) throw new Error('Canva no quedó filtrado estrictamente por setlist.');
  if (!controller.text.includes("notify('Esta presentación Canva no pertenece a este setlist.'")) throw new Error('Falta guard estricto Canva/setlist.');
  if (!controller.text.includes('        setlistId: eventoId,')) throw new Error('Los Canva nuevos no guardan setlistId.');
  if (!permissions.text.includes('PERMISSIONS.MULTIMEDIA_EDIT, PERMISSIONS.MULTIMEDIA_DELETE, PERMISSIONS.MULTIMEDIA_CENTRAL_ACCESS')) throw new Error('Defaults Multimedia no incluyen eliminar.');
  if (!presets.text.includes('  PERMISSIONS.MULTIMEDIA_DELETE,')) throw new Error('Preset Multimedia no incluye eliminar.');
  if (!functionsFile.text.includes(canvaCatalog) || !functionsFile.text.includes('"sermons.createPoint"')) throw new Error('Catálogo backend de permisos sigue incompleto.');
  if (!rules.text.includes(rulesAfter)) throw new Error('Reglas no incluyen multimedia.delete en fallback.');

  writeAll();
  console.log('[ok] selector Biblia/Puntos desktop único');
  console.log('[ok] selector Biblia/Puntos móvil compacto');
  console.log('[ok] Canva filtrado estrictamente por setlist');
  console.log('[ok] Canva legacy deja de aparecer globalmente');
  console.log('[ok] preset Multimedia incluye proyección, edición, eliminación y control de salidas');
  console.log('[ok] backend de permisos acepta el preset completo');
  console.log('[ok] reglas alineadas con rol Multimedia');
  console.log('FINAL V3 OK: Biblia limpia en PC/móvil, Canva por setlist y permisos Multimedia completos.');
} catch (error) {
  restoreAll();
  console.error('[rollback] Se restauraron todos los archivos al estado previo de FINAL V3.');
  throw error;
}
