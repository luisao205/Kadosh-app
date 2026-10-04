import fs from 'node:fs';

const touchedPaths = [
  'src/components/live/ProyectorController.jsx',
  'src/components/live/Proyector.jsx',
  'src/components/live/StageDisplayCantantes.jsx',
  'src/components/live/StageDisplayMusicos.jsx',
  'src/utils/quickMessageFunctions.js',
  'functions/index.js',
  'firestore.rules',
];

for (const filePath of touchedPaths) {
  if (!fs.existsSync(filePath)) throw new Error(`No existe ${filePath}.`);
}

// Este wrapper es deliberadamente transaccional a nivel de archivos:
// primero guarda una copia exacta, aplica V1 y luego el scope por setlist.
// Si cualquier paso falla, restaura todo lo que había antes de ejecutar V2.
const snapshots = new Map(touchedPaths.map((filePath) => [filePath, fs.readFileSync(filePath)]));

const restoreAll = () => {
  for (const [filePath, bytes] of snapshots.entries()) fs.writeFileSync(filePath, bytes);
};

const readText = (filePath) => {
  const raw = fs.readFileSync(filePath, 'utf8');
  return {
    raw,
    eol: raw.includes('\r\n') ? '\r\n' : '\n',
    text: raw.replace(/\r\n/g, '\n'),
  };
};

const writeText = (filePath, file) => {
  fs.writeFileSync(filePath, file.text.replace(/\n/g, file.eol), 'utf8');
};

try {
  // 1) Aplicar la selección por salidas para Biblia/Puntos.
  // El helper V1 ya valida todas sus transformaciones antes de escribir.
  await import(new URL('./enable-bible-point-output-targets-v1.mjs', import.meta.url));
  console.log('[ok] routing Biblia/Puntos V1 integrado');

  const controllerPath = 'src/components/live/ProyectorController.jsx';
  const rulesPath = 'firestore.rules';
  const controller = readText(controllerPath);
  const rules = readText(rulesPath);

  // 2) La biblioteca Canva deja de ser global en la UI: cada setlist/evento
  // ve sus presentaciones. Los documentos legacy sin setlistId se muestran
  // temporalmente para no perderlos; al proyectarlos o guardarlos se asignan
  // explícitamente al setlist actual.
  const oldLibraryEffect = `    const libraryQuery = query(collection(db, 'canvaPresentations'), orderBy('updatedAt', 'desc'));\n    const unsubscribe = onSnapshot(libraryQuery, (snapshot) => {\n      setCanvaLibrary(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));\n    }, (error) => {\n      console.error('Error leyendo biblioteca Canva:', error);\n    });\n    return () => unsubscribe();\n  }, [canAccessCanva]);`;

  const newLibraryEffect = `    const libraryQuery = query(collection(db, 'canvaPresentations'), orderBy('updatedAt', 'desc'));\n    const unsubscribe = onSnapshot(libraryQuery, (snapshot) => {\n      const presentations = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));\n      const scoped = presentations.filter((item) => item.setlistId === eventoId);\n      const legacyUnassigned = presentations.filter((item) => !item.setlistId);\n      setCanvaLibrary([...scoped, ...legacyUnassigned]);\n    }, (error) => {\n      console.error('Error leyendo biblioteca Canva del setlist:', error);\n    });\n    return () => unsubscribe();\n  }, [canAccessCanva, eventoId]);`;

  if (!controller.text.includes(newLibraryEffect)) {
    if (!controller.text.includes(oldLibraryEffect)) {
      throw new Error('No se encontró el listener actual de la biblioteca Canva para limitarlo por setlist.');
    }
    controller.text = controller.text.replace(oldLibraryEffect, newLibraryEffect);
    console.log('[ok] biblioteca Canva limitada al setlist actual');
  } else {
    console.log('[skip] biblioteca Canva por setlist: ya aplicada.');
  }

  // 3) Cada alta/edición guarda el identificador del setlist actual.
  {
    const start = controller.text.indexOf('  const saveCanvaPresentation = async () => {');
    const end = controller.text.indexOf('  const deleteCanvaPresentation = async', start);
    if (start < 0 || end < 0) throw new Error('No se pudo aislar saveCanvaPresentation.');
    let block = controller.text.slice(start, end);

    if (!block.includes('        setlistId: eventoId,')) {
      const anchor = `        pageCount: Math.max(1, Math.min(500, Math.floor(Number(canvaPageCount) || 1))),`;
      if (!block.includes(anchor)) throw new Error('No se encontró pageCount del payload Canva.');
      block = block.replace(anchor, `${anchor}\n        setlistId: eventoId,`);
      controller.text = controller.text.slice(0, start) + block + controller.text.slice(end);
      console.log('[ok] Canva nuevo/editado queda vinculado al setlist');
    } else {
      console.log('[skip] setlistId en guardado Canva: ya aplicado.');
    }
  }

  // 4) Compatibilidad segura con los Canva existentes anteriores a este cambio.
  // Solo se reclaman para un setlist cuando el usuario los proyecta desde ese setlist.
  {
    const start = controller.text.indexOf('  const projectSavedCanva = async (item) => {');
    const end = controller.text.indexOf('\n\n  const changeCanvaPage', start);
    if (start < 0 || end < 0) throw new Error('No se pudo aislar projectSavedCanva.');
    let block = controller.text.slice(start, end);

    const legacyClaim = `    if (item.setlistId && item.setlistId !== eventoId) {\n      notify('Esta presentación Canva pertenece a otro setlist.', { type: 'error' });\n      return;\n    }\n    if (!item.setlistId) {\n      const now = Date.now();\n      await setDoc(doc(db, 'canvaPresentations', item.id), {\n        setlistId: eventoId,\n        updatedAt: now,\n        updatedBy: user?.uid || ''\n      }, { merge: true });\n      item = { ...item, setlistId: eventoId, updatedAt: now, updatedBy: user?.uid || '' };\n    }`;

    if (!block.includes(legacyClaim)) {
      const guard = `    if (!item?.id || !canProjectCanva) return;`;
      if (!block.includes(guard)) throw new Error('No se encontró guard de projectSavedCanva.');
      block = block.replace(guard, `${guard}\n${legacyClaim}`);
      controller.text = controller.text.slice(0, start) + block + controller.text.slice(end);
      console.log('[ok] Canva legacy se asigna al setlist solo al usarlo');
    } else {
      console.log('[skip] adopción Canva legacy: ya aplicada.');
    }
  }

  // 5) Texto de biblioteca: deja claro el alcance sin cambiar la UI completa.
  controller.text = controller.text.replaceAll('Mis presentaciones Canva', 'Canva de este setlist');
  controller.text = controller.text.replaceAll('Mis presentaciones</p>', 'Canva de este setlist</p>');

  // 6) Firestore: el documento Canva admite y exige setlistId a partir de ahora.
  const oldAllowedFields = `          'title', 'inputUrl', 'sourceUrl', 'embedUrl', 'pageCount', 'defaultTargets',\n          'createdAt', 'createdBy', 'updatedAt', 'updatedBy'`;
  const newAllowedFields = `          'title', 'inputUrl', 'sourceUrl', 'embedUrl', 'pageCount', 'defaultTargets', 'setlistId',\n          'createdAt', 'createdBy', 'updatedAt', 'updatedBy'`;
  if (!rules.text.includes(newAllowedFields)) {
    if (!rules.text.includes(oldAllowedFields)) throw new Error('No se encontró lista de campos de canvaPresentations en reglas.');
    rules.text = rules.text.replace(oldAllowedFields, newAllowedFields);
    console.log('[ok] reglas Canva aceptan setlistId');
  }

  const titleValidation = `        && request.resource.data.title is string`;
  const setlistValidation = `        && request.resource.data.setlistId is string\n        && request.resource.data.setlistId.size() > 0\n        && request.resource.data.title is string`;
  if (!rules.text.includes(setlistValidation)) {
    const functionStart = rules.text.indexOf('    function validCanvaPresentationDocument() {');
    const functionEnd = rules.text.indexOf('    match /canvaPresentations/', functionStart);
    if (functionStart < 0 || functionEnd < 0) throw new Error('No se pudo aislar validCanvaPresentationDocument.');
    const block = rules.text.slice(functionStart, functionEnd);
    if (!block.includes(titleValidation)) throw new Error('No se encontró validación de title en canvaPresentations.');
    const nextBlock = block.replace(titleValidation, setlistValidation);
    rules.text = rules.text.slice(0, functionStart) + nextBlock + rules.text.slice(functionEnd);
    console.log('[ok] reglas exigen setlistId en Canva guardado');
  }

  // Validaciones finales del combo completo.
  if (!controller.text.includes('KADOSH_CONTENT_OUTPUT_TARGETS_V1')) throw new Error('Falta routing Biblia/Puntos V1.');
  if (!controller.text.includes('setCanvaLibrary([...scoped, ...legacyUnassigned]);')) throw new Error('Falta scope Canva por setlist.');
  if (!controller.text.includes('        setlistId: eventoId,')) throw new Error('Falta setlistId al guardar Canva.');
  if (!controller.text.includes("notify('Esta presentación Canva pertenece a otro setlist.'")) throw new Error('Falta protección contra Canva de otro setlist.');
  if (!rules.text.includes("'defaultTargets', 'setlistId'")) throw new Error('Reglas no incluyen setlistId.');
  if (!rules.text.includes('request.resource.data.setlistId.size() > 0')) throw new Error('Reglas no validan setlistId.');

  writeText(controllerPath, controller);
  writeText(rulesPath, rules);

  console.log('[ok] Biblia/Puntos con destinos por pantalla');
  console.log('[ok] Canva separado por setlist sin borrar presentaciones antiguas');
  console.log('[ok] Canva legacy se adopta al setlist al primer uso');
  console.log('ROUTING + CANVA POR SETLIST V2 OK');
} catch (error) {
  restoreAll();
  console.error('[rollback] Se restauraron todos los archivos al estado previo de V2.');
  throw error;
}
