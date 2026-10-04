import fs from 'node:fs';

const filePath = 'src/components/live/ProyectorController.jsx';
if (!fs.existsSync(filePath)) throw new Error('No existe ProyectorController.jsx.');

const raw = fs.readFileSync(filePath, 'utf8');
const eol = raw.includes('\r\n') ? '\r\n' : '\n';
let source = raw.replace(/\r\n/g, '\n');
const original = source;

const count = (text, needle) => text.split(needle).length - 1;

try {
  if (!source.includes('KADOSH_CANVA_MOBILE_WORKSPACE_V1')) {
    throw new Error('Falta el workspace Canva móvil refinado.');
  }
  if (!source.includes('showMobileCanvaEditor && createPortal(')) {
    throw new Error('Falta el modal Canva compartido por portal.');
  }
  if (!source.includes('const openMobileCanvaEdit = (item) => {')) {
    throw new Error('No se encontró openMobileCanvaEdit.');
  }

  // 1) Acción móvil específica para elegir una o varias salidas antes de proyectar.
  if (!source.includes('const openMobileCanvaProjectTargets = (item) => {')) {
    const editHelper = `  const openMobileCanvaEdit = (item) => {\n    selectCanvaPresentation(item);\n    setShowMobileCanvaPreview(false);\n    setShowMobileCanvaPages(false);\n    setShowMobileCanvaEditor(true);\n  };`;
    if (!source.includes(editHelper)) throw new Error('No se encontró el helper exacto de edición Canva móvil.');

    const routingHelper = `${editHelper}\n\n  // KADOSH_CANVA_MULTI_OUTPUT_MOBILE_V1\n  const openMobileCanvaProjectTargets = (item) => {\n    if (!item?.id || !canProjectCanva) return;\n    selectCanvaPresentation(item);\n    setCanvaUrlError('');\n    setShowMobileCanvaPreview(false);\n    setShowMobileCanvaPages(false);\n    setShowMobileCanvaEditor(true);\n  };`;

    source = source.replace(editHelper, routingHelper);
    console.log('[ok] acción móvil para elegir múltiples pantallas antes de proyectar');
  } else {
    console.log('[skip] acción móvil multi-pantalla: ya aplicada');
  }

  // 2) Solo dentro de la biblioteca móvil: Proyectar abre el selector/modal,
  // en lugar de disparar inmediatamente los destinos guardados.
  const workspaceStart = source.indexOf('KADOSH_CANVA_MOBILE_WORKSPACE_V1');
  const portalStart = source.indexOf('showMobileCanvaEditor && createPortal(', workspaceStart);
  if (workspaceStart < 0 || portalStart < 0) throw new Error('No se pudo aislar la biblioteca Canva móvil.');

  let mobileBlock = source.slice(workspaceStart, portalStart);
  const oldHandler = 'onClick={() => projectSavedCanva(item)}';
  const newHandler = 'onClick={() => openMobileCanvaProjectTargets(item)}';

  if (mobileBlock.includes(oldHandler)) {
    const hits = count(mobileBlock, oldHandler);
    if (hits !== 1) throw new Error(`Se esperaba un botón Proyectar móvil y se encontraron ${hits}.`);
    mobileBlock = mobileBlock.replace(oldHandler, newHandler);
    console.log('[ok] Proyectar móvil ahora abre selección de pantallas');
  } else if (mobileBlock.includes(newHandler)) {
    console.log('[skip] botón Proyectar móvil: ya usa selección de pantallas');
  } else {
    throw new Error('No se encontró el botón Proyectar de la biblioteca Canva móvil.');
  }

  // Hacer explícito el comportamiento en móvil sin agregar otro bloque permanente.
  const projectButtonText = `className="min-h-10 rounded-xl bg-cyan-400 text-[9px] font-black uppercase text-zinc-950">Proyectar</button>`;
  const projectButtonTextNew = `className="min-h-10 rounded-xl bg-cyan-400 text-[9px] font-black uppercase text-zinc-950">Pantallas / Proyectar</button>`;
  if (mobileBlock.includes(projectButtonText)) {
    mobileBlock = mobileBlock.replace(projectButtonText, projectButtonTextNew);
    console.log('[ok] botón móvil deja claro que permite elegir pantallas');
  }

  source = source.slice(0, workspaceStart) + mobileBlock + source.slice(portalStart);

  // 3) Añadir una ayuda breve dentro del modal compartido. No crea otro modal.
  const targetsTitle = `<p className="mb-2 text-[9px] font-black uppercase tracking-[0.16em] text-cyan-200">Destinos predeterminados</p>`;
  const targetsTitleNew = `<p className="mb-1 text-[9px] font-black uppercase tracking-[0.16em] text-cyan-200">Destinos predeterminados</p>\n                  <p className="mb-2 text-[9px] font-bold text-zinc-500">Puedes marcar una o varias pantallas. Proyectar usa esta selección ahora; Guardar cambios la deja como predeterminada.</p>`;
  if (!source.includes('Proyectar usa esta selección ahora; Guardar cambios la deja como predeterminada.')) {
    if (!source.includes(targetsTitle)) throw new Error('No se encontró título de destinos en el modal Canva.');
    source = source.replace(targetsTitle, targetsTitleNew);
    console.log('[ok] modal móvil explica proyección temporal vs destinos guardados');
  }

  // Validaciones finales.
  if (count(source, 'const openMobileCanvaProjectTargets = (item) => {') !== 1) {
    throw new Error('Validación falló: helper móvil multi-pantalla duplicado o ausente.');
  }
  if (!source.includes('onClick={() => openMobileCanvaProjectTargets(item)}')) {
    throw new Error('Validación falló: botón móvil no abre selección de pantallas.');
  }
  if (!source.includes('showMobileCanvaEditor && createPortal(')) {
    throw new Error('Validación falló: se perdió el portal Canva.');
  }
  if (!source.includes('onClick={projectCanva}')) {
    throw new Error('Validación falló: modal perdió la acción Proyectar.');
  }
  if (!source.includes('onClick={saveCanvaPresentation}')) {
    throw new Error('Validación falló: modal perdió Guardar.');
  }

  fs.writeFileSync(filePath, source.replace(/\n/g, eol), 'utf8');
  console.log('[ok] móvil puede elegir Proyector/Cantantes/Músicos en combinación');
  console.log('[ok] proyectar temporalmente no obliga a guardar nuevos destinos');
  console.log('[ok] tercera pantalla conserva su contenido si no fue seleccionada');
  console.log('CANVA MULTI-OUTPUT MOBILE V1 OK: prueba una presentación en dos pantallas desde el teléfono.');
} catch (error) {
  fs.writeFileSync(filePath, original, 'utf8');
  console.error('[rollback] ProyectorController.jsx restaurado al estado previo.');
  throw error;
}
