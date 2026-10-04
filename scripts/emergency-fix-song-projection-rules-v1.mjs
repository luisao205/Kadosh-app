import fs from 'node:fs';

const filePath = 'firestore.rules';
if (!fs.existsSync(filePath)) throw new Error('No existe firestore.rules.');

const raw = fs.readFileSync(filePath, 'utf8');
const eol = raw.includes('\r\n') ? '\r\n' : '\n';
let source = raw.replace(/\r\n/g, '\n');
const original = source;

const count = (text, needle) => text.split(needle).length - 1;

try {
  // Si hasta el Dueño recibe permission-denied, el problema no es el rol:
  // la validación genérica de proyección está rechazando la forma real del write
  // de canciones después del handoff selectivo Canva/Media.
  // Este camino dedicado acepta SOLO una proyección lyrics válida y SOLO permite
  // retirar rutas existentes; no permite crear/modificar rutas Canva/Media.
  if (!source.includes('function canUpdateEventLyricsProjection()')) {
    const anchor = '    function canUpdateEventProjection(eventoId) {';
    const index = source.indexOf(anchor);
    if (index < 0) throw new Error('No se encontró canUpdateEventProjection(eventoId).');

    const helper = `    // KADOSH_SONG_PROJECTION_RULES_V1\n    function canUpdateEventLyricsProjection() {\n      return hasPermission('multimedia.project')\n        && request.resource.data.projectorState is map\n        && request.resource.data.projectorState.type == 'lyrics'\n        && request.resource.data.projectorState.contentType == 'lyrics'\n        && request.resource.data.projectorState.media == null\n        && request.resource.data.proyectorMedia == null\n        && onlyEventKeys(projectorEventFields())\n        && (\n          !changedEventKeys().hasAny(['canvaOutputs'])\n          || (request.resource.data.canvaOutputs is map && canvaOutputsOnlyRemove())\n        )\n        && (\n          !changedEventKeys().hasAny(['mediaOutputs'])\n          || (request.resource.data.mediaOutputs is map && mediaOutputsOnlyRemove())\n        )\n        && (\n          !changedEventKeys().hasAny(['announcementState'])\n          || validInactiveAnnouncementState()\n        );\n    }\n\n`;

    source = source.slice(0, index) + helper + source.slice(index);
    console.log('[ok] regla dedicada para proyección de canciones creada');
  } else {
    console.log('[skip] regla dedicada de canciones: ya existe');
  }

  const oldProjectionRouter = `    function canUpdateEventProjection(eventoId) {\n      let state = request.resource.data.projectorState;\n      return state is map && state.type == 'announcement'\n        ? canUpdateEventAnnouncement()\n        : (state is map && 'sourceActor' in state && state.sourceActor == 'pastor'\n          ? canUpdateEventAsPastorProjection(eventoId)\n          : canUpdateEventAsMedia());\n    }`;

  const newProjectionRouter = `    function canUpdateEventProjection(eventoId) {\n      let state = request.resource.data.projectorState;\n      return state is map && state.type == 'lyrics' && state.contentType == 'lyrics'\n        ? canUpdateEventLyricsProjection()\n        : (state is map && state.type == 'announcement'\n          ? canUpdateEventAnnouncement()\n          : (state is map && 'sourceActor' in state && state.sourceActor == 'pastor'\n            ? canUpdateEventAsPastorProjection(eventoId)\n            : canUpdateEventAsMedia()));\n    }`;

  if (!source.includes(newProjectionRouter)) {
    if (!source.includes(oldProjectionRouter)) {
      throw new Error('No se encontró el router actual de proyección para insertar el camino de canciones.');
    }
    source = source.replace(oldProjectionRouter, newProjectionRouter);
    console.log('[ok] canciones usan validación dedicada antes de la validación genérica');
  } else {
    console.log('[skip] router de canciones: ya aplicado');
  }

  if (count(source, 'function canUpdateEventLyricsProjection()') !== 1) {
    throw new Error('Validación falló: debe existir una sola regla dedicada de canciones.');
  }
  if (!source.includes("state.type == 'lyrics' && state.contentType == 'lyrics'\n        ? canUpdateEventLyricsProjection()")) {
    throw new Error('Validación falló: el router no usa la regla dedicada de canciones.');
  }
  if (!source.includes("request.resource.data.canvaOutputs is map && canvaOutputsOnlyRemove()")) {
    throw new Error('Validación falló: el handoff Canva de canciones no quedó limitado a retirar rutas.');
  }
  if (!source.includes("request.resource.data.mediaOutputs is map && mediaOutputsOnlyRemove()")) {
    throw new Error('Validación falló: el handoff Multimedia de canciones no quedó limitado a retirar rutas.');
  }

  fs.writeFileSync(filePath, source.replace(/\n/g, eol), 'utf8');
  console.log('[ok] Dueño y Multimedia pueden proyectar lyrics sin depender del esquema interno de rutas ya existentes');
  console.log('SONG PROJECTION RULES V1 OK: despliega solo firestore:rules y prueba una diapositiva.');
} catch (error) {
  fs.writeFileSync(filePath, original, 'utf8');
  console.error('[rollback] firestore.rules restaurado al estado previo.');
  throw error;
}
