import fs from 'node:fs';

const filePath = 'firestore.rules';
if (!fs.existsSync(filePath)) throw new Error('No existe firestore.rules.');

const raw = fs.readFileSync(filePath, 'utf8');
const eol = raw.includes('\r\n') ? '\r\n' : '\n';
let source = raw.replace(/\r\n/g, '\n');
const original = source;

const replaceExact = (before, after, label) => {
  if (source.includes(after)) {
    console.log(`[skip] ${label}: ya aplicado.`);
    return;
  }
  if (!source.includes(before)) throw new Error(`No se encontró el bloque para ${label}.`);
  source = source.replace(before, after);
  console.log(`[ok] ${label}`);
};

// KADOSH_CANVA_OUTPUT_DESK_RULES_V1
// El Output Desk añade page/pageCount a cada canvaOutput y persiste canvaPageMemory
// en el evento. Las reglas anteriores rechazaban ambos campos, por eso Firestore
// devolvía permission-denied al proyectar una presentación guardada.

replaceExact(
`    function validCanvaOutputState(state) {
      return state is map
        && state.keys().hasOnly(['active', 'presentationId', 'title', 'sourceUrl', 'embedUrl', 'updatedAt', 'updatedBy'])
        && state.active == true
        && state.presentationId is string
        && state.title is string
        && state.sourceUrl is string
        && state.embedUrl is string
        && state.updatedAt is int
        && state.updatedBy is string;
    }
`,
`    // KADOSH_CANVA_OUTPUT_DESK_RULES_V1
    function validCanvaOutputState(state) {
      return state is map
        && state.keys().hasOnly([
          'active', 'presentationId', 'title', 'sourceUrl', 'embedUrl',
          'page', 'pageCount', 'updatedAt', 'updatedBy'
        ])
        && state.active == true
        && state.presentationId is string
        && state.title is string
        && state.sourceUrl is string
        && state.embedUrl is string
        && (!('page' in state) || (state.page is int && state.page >= 1 && state.page <= 500))
        && (!('pageCount' in state) || (state.pageCount is int && state.pageCount >= 0 && state.pageCount <= 500))
        && (!('page' in state) || !('pageCount' in state) || state.pageCount == 0 || state.page <= state.pageCount)
        && state.updatedAt is int
        && state.updatedBy is string;
    }
`,
  'page/pageCount permitidos en canvaOutputs'
);

replaceExact(
`    function canUpdateEventCanvaOutputs() {
      return hasPermission('canva.project')
        && onlyEventKeys(['canvaOutputs', 'mediaOutputs'])
        && validCanvaOutputsMap()
        && (
          !changedEventKeys().hasAny(['mediaOutputs'])
          || (validMediaOutputsMap() && mediaOutputsOnlyRemove())
        );
    }
`,
`    function validCanvaPageMemory() {
      let memory = request.resource.data.canvaPageMemory;
      return memory is map
        && memory.keys().hasOnly(['projector', 'singers', 'musicians'])
        && (!('projector' in memory) || (memory.projector is map && memory.projector.size() <= 500))
        && (!('singers' in memory) || (memory.singers is map && memory.singers.size() <= 500))
        && (!('musicians' in memory) || (memory.musicians is map && memory.musicians.size() <= 500));
    }

    function canUpdateEventCanvaOutputs() {
      return hasPermission('canva.project')
        && onlyEventKeys(['canvaOutputs', 'mediaOutputs', 'canvaPageMemory'])
        && validCanvaOutputsMap()
        && (
          !changedEventKeys().hasAny(['mediaOutputs'])
          || (validMediaOutputsMap() && mediaOutputsOnlyRemove())
        )
        && (
          !changedEventKeys().hasAny(['canvaPageMemory'])
          || validCanvaPageMemory()
        );
    }
`,
  'memoria de página Canva permitida solo con canva.project'
);

if (!source.includes('KADOSH_CANVA_OUTPUT_DESK_RULES_V1')) {
  throw new Error('Validación falló: marcador de reglas Canva Output Desk ausente.');
}
if (!source.includes("onlyEventKeys(['canvaOutputs', 'mediaOutputs', 'canvaPageMemory'])")) {
  throw new Error('Validación falló: canvaPageMemory no quedó autorizado en el flujo Canva.');
}
if (!source.includes("'page', 'pageCount', 'updatedAt', 'updatedBy'")) {
  throw new Error('Validación falló: page/pageCount no quedaron autorizados en canvaOutputs.');
}

try {
  fs.writeFileSync(filePath, source.replace(/\n/g, eol), 'utf8');
  console.log('Reglas Canva Output Desk aplicadas: páginas por salida y memoria del evento ya pueden guardarse con permiso canva.project.');
} catch (error) {
  fs.writeFileSync(filePath, original.replace(/\n/g, eol), 'utf8');
  throw error;
}
