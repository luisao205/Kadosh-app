import fs from 'node:fs';

const filePath = 'src/components/live/ProyectorController.jsx';
if (!fs.existsSync(filePath)) throw new Error('No existe ProyectorController.jsx.');

const raw = fs.readFileSync(filePath, 'utf8');
const eol = raw.includes('\r\n') ? '\r\n' : '\n';
let source = raw.replace(/\r\n/g, '\n');
const original = source;

try {
  if (!source.includes("import { createPortal } from 'react-dom';")) {
    throw new Error('No se encontró createPortal importado en ProyectorController.jsx.');
  }
  if (!source.includes('const openMobileCanvaCreate = () => {')) {
    throw new Error('No se encontró openMobileCanvaCreate.');
  }
  if (!source.includes('setShowMobileCanvaEditor(true);')) {
    throw new Error('El helper de apertura Canva no activa showMobileCanvaEditor.');
  }
  if (!source.includes('onClick={openMobileCanvaCreate}')) {
    throw new Error('No se encontró el botón Nueva conectado a openMobileCanvaCreate.');
  }

  const startMarker = '        {showMobileCanvaEditor && (';
  const portalStartMarker = '        {showMobileCanvaEditor && createPortal((';
  const endMarker = "\n\n        {projectionSourceMode === 'bible' && (";

  if (!source.includes(portalStartMarker)) {
    const start = source.indexOf(startMarker);
    if (start < 0) throw new Error('No se encontró el modal Canva para convertirlo a portal.');
    const end = source.indexOf(endMarker, start);
    if (end < 0) throw new Error('No se encontró el límite final del modal Canva.');

    let block = source.slice(start, end);
    if (!block.includes('closeMobileCanvaEditor')) {
      throw new Error('El bloque detectado no parece ser el modal Canva esperado.');
    }

    block = block.replace(startMarker, portalStartMarker);
    block = block.replace('backdrop-blur-xl md:hidden', 'backdrop-blur-xl');

    const trimmed = block.trimEnd();
    if (!trimmed.endsWith('        )}')) {
      throw new Error('No se pudo identificar el cierre del modal Canva.');
    }
    const closeIndex = block.lastIndexOf('        )}');
    block = block.slice(0, closeIndex) + '        ), document.body)}' + block.slice(closeIndex + '        )}'.length);

    source = source.slice(0, start) + block + source.slice(end);
    console.log('[ok] modal Crear/Editar Canva movido a portal de document.body');
  } else {
    console.log('[skip] modal Canva ya usa portal.');
  }

  // Asegurar que Nueva siempre limpie el borrador y abra el editor.
  const createBefore = `  const openMobileCanvaCreate = () => {\n    newCanvaPresentation();\n    setShowMobileCanvaPreview(false);\n    setShowMobileCanvaPages(false);\n    setShowMobileCanvaEditor(true);\n  };`;
  const createAfter = `  const openMobileCanvaCreate = () => {\n    newCanvaPresentation();\n    setShowMobileCanvaPreview(false);\n    setShowMobileCanvaPages(false);\n    setShowMobileCanvaEditor(true);\n  };`;
  if (!source.includes(createAfter)) {
    if (!source.includes(createBefore)) throw new Error('No se encontró helper exacto de creación Canva.');
    source = source.replace(createBefore, createAfter);
  }

  // Validaciones: el portal debe existir una sola vez y seguir compartido por PC/móvil.
  const portalCount = source.split('showMobileCanvaEditor && createPortal((').length - 1;
  if (portalCount !== 1) throw new Error(`Se esperaba un solo portal Canva y se encontraron ${portalCount}.`);
  if (!source.includes('), document.body)}')) throw new Error('Falta destino document.body del portal Canva.');
  if (!source.includes('onClick={openMobileCanvaCreate}')) throw new Error('Botón Nueva perdió su handler.');
  if (!source.includes('openMobileCanvaEdit(item)')) throw new Error('Editar Canva perdió su handler.');
  if (!source.includes('saveCanvaPresentation')) throw new Error('Modal perdió la acción de guardar Canva.');

  fs.writeFileSync(filePath, source.replace(/\n/g, eol), 'utf8');
  console.log('[ok] Nueva abre el editor Canva también en PC');
  console.log('[ok] Editar usa el mismo modal compartido');
  console.log('[ok] móvil conserva el mismo editor sin duplicarlo');
  console.log('CANVA MODAL PORTAL V1 OK: Crear/Editar ya no depende del contenedor móvil oculto en desktop.');
} catch (error) {
  fs.writeFileSync(filePath, original, 'utf8');
  console.error('[rollback] ProyectorController.jsx restaurado al estado previo.');
  throw error;
}
