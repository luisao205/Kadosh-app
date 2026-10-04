import fs from 'node:fs';

const filePath = 'firestore.rules';
if (!fs.existsSync(filePath)) throw new Error('No existe firestore.rules.');

const raw = fs.readFileSync(filePath, 'utf8');
const eol = raw.includes('\r\n') ? '\r\n' : '\n';
let source = raw.replace(/\r\n/g, '\n');
const original = source;

const replaceOnce = (before, after, label) => {
  if (source.includes(after)) {
    console.log(`[skip] ${label}: ya aplicado.`);
    return;
  }
  if (!source.includes(before)) throw new Error(`No se encontró el bloque para ${label}.`);
  source = source.replace(before, after);
  console.log(`[ok] ${label}`);
};

try {
  // 1) El Controlador habilita edición del bosquejo con bible.project, pero las reglas
  // antiguas exigían events.edit. Alinear ambas capas para Multimedia y Dueño.
  replaceOnce(
    `    function canUpdateEventBibleOutline() {\n      return hasPermission('events.edit')`,
    `    function canUpdateEventBibleOutline() {\n      return (hasPermission('bible.project') || hasPermission('events.edit'))`,
    'bosquejo bíblico permitido con bible.project'
  );

  // 2) Biblia necesita su propio camino de validación, igual que canciones.
  // La proyección puede retirar rutas Canva/Media existentes, pero nunca crearlas ni
  // modificar las salidas no seleccionadas. No revalida el esquema histórico de las
  // rutas que quedan intactas, porque eso bloqueaba documentos legacy válidos.
  if (!source.includes('function canUpdateEventBibleProjection()')) {
    const anchor = '    function canUpdateEventProjection(eventoId) {';
    const index = source.indexOf(anchor);
    if (index < 0) throw new Error('No se encontró canUpdateEventProjection(eventoId).');

    const helper = `    // KADOSH_BIBLE_PROJECTION_RULES_V1\n    function canUpdateEventBibleProjection() {\n      return hasPermission('bible.project')\n        && request.resource.data.projectorState is map\n        && request.resource.data.projectorState.type == 'preaching'\n        && request.resource.data.projectorState.contentType == 'bible'\n        && request.resource.data.projectorState.media == null\n        && request.resource.data.proyectorMedia == null\n        && request.resource.data.proyectorFondo == null\n        && request.resource.data.proyectorFondoMedia == null\n        && onlyEventKeys(bibleProjectionFields())\n        && biblePreviousProjectionIsTrusted()\n        && (\n          !changedEventKeys().hasAny(['canvaOutputs'])\n          || (request.resource.data.canvaOutputs is map && canvaOutputsOnlyRemove())\n        )\n        && (\n          !changedEventKeys().hasAny(['mediaOutputs'])\n          || (request.resource.data.mediaOutputs is map && mediaOutputsOnlyRemove())\n        )\n        && (\n          !changedEventKeys().hasAny(['announcementState'])\n          || validInactiveAnnouncementState()\n        )\n        && (\n          !changedEventKeys().hasAny(['projectionTargets'])\n          || validProjectionTargetsMap()\n        );\n    }\n\n`;

    source = source.slice(0, index) + helper + source.slice(index);
    console.log('[ok] regla dedicada para proyección bíblica creada');
  } else {
    console.log('[skip] regla dedicada de Biblia: ya existe');
  }

  // 3) Router actual después del fix de canciones: Biblia debe entrar antes de la
  // validación genérica canUpdateEventAsMedia().
  const songRouterStart = `      return state is map && state.type == 'lyrics' && state.contentType == 'lyrics'\n        ? canUpdateEventLyricsProjection()\n        : (state is map && state.type == 'announcement'`;
  const bibleRouterStart = `      return state is map && state.type == 'lyrics' && state.contentType == 'lyrics'\n        ? canUpdateEventLyricsProjection()\n        : (state is map && state.type == 'preaching' && state.contentType == 'bible'\n          ? canUpdateEventBibleProjection()\n          : (state is map && state.type == 'announcement'`;

  if (!source.includes(bibleRouterStart)) {
    if (!source.includes(songRouterStart)) {
      throw new Error('No se encontró el router posterior al fix de canciones. Aplica primero emergency-fix-song-projection-rules-v1.mjs.');
    }
    source = source.replace(songRouterStart, bibleRouterStart);

    const oldTail = `          : (state is map && 'sourceActor' in state && state.sourceActor == 'pastor'\n            ? canUpdateEventAsPastorProjection(eventoId)\n            : canUpdateEventAsMedia()));\n    }`;
    const newTail = `            : (state is map && 'sourceActor' in state && state.sourceActor == 'pastor'\n              ? canUpdateEventAsPastorProjection(eventoId)\n              : canUpdateEventAsMedia())));\n    }`;
    if (!source.includes(oldTail)) throw new Error('No se encontró el cierre del router de proyección.');
    source = source.replace(oldTail, newTail);
    console.log('[ok] Biblia usa validación dedicada antes de la validación genérica');
  } else {
    console.log('[skip] router bíblico: ya aplicado.');
  }

  // Validaciones antes de escribir.
  if (!source.includes("return (hasPermission('bible.project') || hasPermission('events.edit'))")) {
    throw new Error('Validación falló: bosquejo no acepta bible.project.');
  }
  if (!source.includes('function canUpdateEventBibleProjection()')) {
    throw new Error('Validación falló: falta regla dedicada de Biblia.');
  }
  if (!source.includes("state.type == 'preaching' && state.contentType == 'bible'\n          ? canUpdateEventBibleProjection()")) {
    throw new Error('Validación falló: router no usa regla dedicada de Biblia.');
  }
  if (!source.includes("request.resource.data.canvaOutputs is map && canvaOutputsOnlyRemove()")) {
    throw new Error('Validación falló: handoff Canva no está limitado a retirar rutas.');
  }
  if (!source.includes("request.resource.data.mediaOutputs is map && mediaOutputsOnlyRemove()")) {
    throw new Error('Validación falló: handoff Media no está limitado a retirar rutas.');
  }
  if (!source.includes('function validProjectionTargetsMap()')) {
    throw new Error('Validación falló: faltan reglas de projectionTargets de Biblia/Puntos V2.');
  }

  fs.writeFileSync(filePath, source.replace(/\n/g, eol), 'utf8');
  console.log('[ok] Multimedia puede crear/editar bosquejo con permiso Biblia');
  console.log('[ok] Multimedia y Dueño pueden proyectar Biblia sin revalidar rutas legacy intactas');
  console.log('[ok] Canva/Media de pantallas no seleccionadas siguen protegidos');
  console.log('BIBLE RULES V1 OK: despliega solo firestore:rules y prueba Agregar al bosquejo + Proyectar Biblia.');
} catch (error) {
  fs.writeFileSync(filePath, original, 'utf8');
  console.error('[rollback] firestore.rules restaurado al estado previo.');
  throw error;
}
