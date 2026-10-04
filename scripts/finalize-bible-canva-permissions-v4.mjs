import fs from 'node:fs';

const paths = [
  'src/components/live/ProyectorController.jsx',
  'src/utils/permissions.js',
  'src/utils/permissionPresets.js',
  'functions/index.js',
  'firestore.rules',
];

for (const filePath of paths) {
  if (!fs.existsSync(filePath)) throw new Error(`No existe ${filePath}.`);
}

const snapshots = new Map(paths.map((filePath) => [filePath, fs.readFileSync(filePath)]));
const restoreAll = () => {
  for (const [filePath, bytes] of snapshots.entries()) fs.writeFileSync(filePath, bytes);
};

const controllerPath = 'src/components/live/ProyectorController.jsx';
const compatMarker = '      {/* VISTA MÓVIL - KADOSH_V4_COMPAT */}\n';

const readController = () => {
  const raw = fs.readFileSync(controllerPath, 'utf8');
  return {
    eol: raw.includes('\r\n') ? '\r\n' : '\n',
    text: raw.replace(/\r\n/g, '\n'),
  };
};

const writeController = ({ eol, text }) => {
  fs.writeFileSync(controllerPath, text.replace(/\n/g, eol), 'utf8');
};

const count = (text, needle) => text.split(needle).length - 1;

try {
  const controller = readController();

  if (!controller.text.includes('KADOSH_CONTENT_OUTPUT_TARGETS_V1')) {
    throw new Error('Falta routing Biblia/Puntos V1/V2.');
  }
  if (!controller.text.includes('KADOSH_BIBLE_DESKTOP_SPLIT_V1')) {
    throw new Error('Falta división Biblia/Puntos desktop.');
  }
  if (!controller.text.includes('        setlistId: eventoId,')) {
    throw new Error('Falta Canva por setlist V2.');
  }

  // El estado local real tiene dos montajes de bibleOutlinePanel con la misma
  // indentación y no conserva el comentario histórico "VISTA MÓVIL".
  // Preparamos temporalmente la forma que V3 espera, sin alterar funcionalidad.
  if (!controller.text.includes('KADOSH_BIBLE_TARGET_SELECTOR_DESKTOP_V2')) {
    const panelRegex = /^([ \t]*)\{bibleOutlinePanel\}[ \t]*$/gm;
    const panelMatches = [...controller.text.matchAll(panelRegex)];
    if (panelMatches.length !== 2) {
      throw new Error(`Se esperaban exactamente 2 montajes renderizados de bibleOutlinePanel y se encontraron ${panelMatches.length}.`);
    }

    const first = panelMatches[0];
    const second = panelMatches[1];
    const firstStart = first.index;
    const firstEnd = firstStart + first[0].length;
    const secondStartOriginal = second.index;

    let prepared = controller.text.slice(0, firstStart)
      + '                {bibleOutlinePanel}'
      + controller.text.slice(firstEnd);

    const lengthDelta = '                {bibleOutlinePanel}'.length - first[0].length;
    const secondStart = secondStartOriginal + lengthDelta;

    if (!prepared.includes('      {/* VISTA MÓVIL')) {
      prepared = prepared.slice(0, secondStart) + compatMarker + prepared.slice(secondStart);
    }

    controller.text = prepared;
    writeController(controller);
    console.log('[ok] compatibilidad local preparada para selector Biblia PC/móvil');
  }

  // Reutiliza las correcciones ya auditadas de V3: selector único/compacto,
  // Canva estricto por setlist y permisos Multimedia completos.
  await import(new URL('./finalize-bible-canva-permissions-v3.mjs', import.meta.url));

  const finalController = readController();
  finalController.text = finalController.text.replaceAll(compatMarker, '');

  if (count(finalController.text, 'KADOSH_BIBLE_TARGET_SELECTOR_DESKTOP_V2') !== 1) {
    throw new Error('Validación V4: selector Biblia desktop no quedó único.');
  }
  if (count(finalController.text, 'KADOSH_BIBLE_TARGET_SELECTOR_MOBILE_V2') !== 1) {
    throw new Error('Validación V4: selector Biblia móvil no quedó único.');
  }
  if (finalController.text.includes('KADOSH_BIBLE_TARGET_SELECTOR_DESKTOP_V1') || finalController.text.includes('KADOSH_BIBLE_TARGET_SELECTOR_MOBILE_V1')) {
    throw new Error('Validación V4: quedaron selectores Biblia V1 duplicados.');
  }
  if (finalController.text.includes('legacyUnassigned')) {
    throw new Error('Validación V4: Canva legacy todavía aparece globalmente.');
  }
  if (!finalController.text.includes('setCanvaLibrary(presentations.filter((item) => item.setlistId === eventoId));')) {
    throw new Error('Validación V4: Canva no quedó estrictamente filtrado por setlist.');
  }
  if (!finalController.text.includes("notify('Esta presentación Canva no pertenece a este setlist.'")) {
    throw new Error('Validación V4: falta protección Canva/setlist.');
  }

  writeController(finalController);

  const permissions = fs.readFileSync('src/utils/permissions.js', 'utf8');
  const presets = fs.readFileSync('src/utils/permissionPresets.js', 'utf8');
  const functions = fs.readFileSync('functions/index.js', 'utf8');
  const rules = fs.readFileSync('firestore.rules', 'utf8');

  if (!permissions.includes('PERMISSIONS.MULTIMEDIA_EDIT, PERMISSIONS.MULTIMEDIA_DELETE, PERMISSIONS.MULTIMEDIA_CENTRAL_ACCESS')) {
    throw new Error('Validación V4: defaults del rol Multimedia incompletos.');
  }
  if (!presets.includes('PERMISSIONS.MULTIMEDIA_DELETE')) {
    throw new Error('Validación V4: preset Multimedia incompleto.');
  }
  if (!functions.includes('"canva.view", "canva.create", "canva.edit", "canva.delete", "canva.project"')) {
    throw new Error('Validación V4: catálogo backend de permisos Canva incompleto.');
  }
  if (!functions.includes('"sermons.createPoint"') || !functions.includes('"sermons.createBiblePassage"')) {
    throw new Error('Validación V4: catálogo backend de Prédica incompleto.');
  }
  if (!rules.includes("'multimedia.libraryView', 'multimedia.upload', 'multimedia.edit', 'multimedia.delete', 'multimedia.centralAccess', 'multimedia.controlOutputs', 'multimedia.project'")) {
    throw new Error('Validación V4: fallback Firestore Multimedia incompleto.');
  }

  console.log('[ok] selector Biblia/Puntos PC único');
  console.log('[ok] selector Biblia/Puntos móvil compacto');
  console.log('[ok] Canva estrictamente separado por setlist');
  console.log('[ok] Canva legacy ya no contamina otros setlists');
  console.log('[ok] rol/preset Multimedia con control, edición, eliminación y proyección');
  console.log('[ok] backend y Firestore alineados con permisos Multimedia');
  console.log('FINAL V4 OK: listo para build y pruebas finales.');
} catch (error) {
  restoreAll();
  console.error('[rollback] Se restauraron todos los archivos al estado previo de FINAL V4.');
  throw error;
}
