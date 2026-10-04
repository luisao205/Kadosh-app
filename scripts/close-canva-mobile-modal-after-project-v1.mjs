import fs from 'node:fs';

const filePath = 'src/components/live/ProyectorController.jsx';
if (!fs.existsSync(filePath)) throw new Error('No existe ProyectorController.jsx.');

const raw = fs.readFileSync(filePath, 'utf8');
const eol = raw.includes('\r\n') ? '\r\n' : '\n';
let source = raw.replace(/\r\n/g, '\n');
const original = source;

try {
  if (!source.includes('showMobileCanvaEditor && createPortal(')) {
    throw new Error('Falta el modal Canva compartido por portal.');
  }
  if (!source.includes('const openMobileCanvaProjectTargets = (item) => {')) {
    throw new Error('Falta la acción móvil Pantallas / Proyectar.');
  }

  // 1) Hacer que projectCanva confirme éxito sin alterar sus fallos actuales.
  const projectStart = source.indexOf('  const projectCanva = async () => {');
  const projectEnd = source.indexOf('\n  const projectSavedCanva = async', projectStart);
  if (projectStart < 0 || projectEnd < 0) throw new Error('No se pudo aislar projectCanva.');

  let projectBlock = source.slice(projectStart, projectEnd);
  const successNotify = "      notify('Canva enviado a las pantallas seleccionadas.', { type: 'success' });";
  const successWithReturn = successNotify + '\n      return true;';
  if (!projectBlock.includes(successWithReturn)) {
    if (!projectBlock.includes(successNotify)) throw new Error('No se encontró confirmación de éxito de projectCanva.');
    projectBlock = projectBlock.replace(successNotify, successWithReturn);
    console.log('[ok] projectCanva ahora confirma éxito');
  } else {
    console.log('[skip] projectCanva ya confirma éxito');
  }
  source = source.slice(0, projectStart) + projectBlock + source.slice(projectEnd);

  // 2) Cerrar el modal SOLO en móvil después de una proyección exitosa.
  if (!source.includes('const projectCanvaAndCloseMobile = async () => {')) {
    const closeHelper = `  const closeMobileCanvaEditor = () => {\n    setShowMobileCanvaPreview(false);\n    setShowMobileCanvaEditor(false);\n  };`;
    if (!source.includes(closeHelper)) throw new Error('No se encontró closeMobileCanvaEditor.');

    const enhanced = `${closeHelper}\n\n  // KADOSH_CANVA_MOBILE_CLOSE_AFTER_PROJECT_V1\n  const projectCanvaAndCloseMobile = async () => {\n    const projected = await projectCanva();\n    if (!projected) return;\n    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches) {\n      setShowMobileCanvaPreview(false);\n      setShowMobileCanvaPages(true);\n      setShowMobileCanvaEditor(false);\n    }\n  };`;

    source = source.replace(closeHelper, enhanced);
    console.log('[ok] cierre automático móvil después de proyectar agregado');
  } else {
    console.log('[skip] cierre automático móvil ya aplicado');
  }

  // 3) Solo el botón Proyectar del modal usa el nuevo handler.
  const portalStart = source.indexOf('showMobileCanvaEditor && createPortal(');
  const portalEnd = source.indexOf(', document.body)}', portalStart);
  if (portalStart < 0 || portalEnd < 0) throw new Error('No se pudo aislar el portal Canva.');

  let portalBlock = source.slice(portalStart, portalEnd);
  if (portalBlock.includes('onClick={projectCanvaAndCloseMobile}')) {
    console.log('[skip] botón Proyectar del modal ya cierra en móvil');
  } else {
    const oldHandler = 'onClick={projectCanva}';
    const hits = portalBlock.split(oldHandler).length - 1;
    if (hits !== 1) throw new Error(`Se esperaba un botón Proyectar en el modal y se encontraron ${hits}.`);
    portalBlock = portalBlock.replace(oldHandler, 'onClick={projectCanvaAndCloseMobile}');
    source = source.slice(0, portalStart) + portalBlock + source.slice(portalEnd);
    console.log('[ok] botón Proyectar del modal conectado al cierre móvil');
  }

  // Validaciones conservadoras.
  if (!source.includes('KADOSH_CANVA_MOBILE_CLOSE_AFTER_PROJECT_V1')) throw new Error('Falta marcador de cierre móvil.');
  if (!source.includes('const projectCanvaAndCloseMobile = async () => {')) throw new Error('Falta handler móvil post-proyección.');
  if (!source.includes('onClick={projectCanvaAndCloseMobile}')) throw new Error('El modal no usa el nuevo handler.');
  if (!source.includes("window.matchMedia('(max-width: 767px)').matches")) throw new Error('Falta protección para cerrar solo en móvil.');
  if (!source.includes('setShowMobileCanvaPages(true);')) throw new Error('No se habilitan páginas al volver al control móvil.');
  if (!source.includes(successWithReturn)) throw new Error('projectCanva no confirma éxito.');

  fs.writeFileSync(filePath, source.replace(/\n/g, eol), 'utf8');
  console.log('[ok] modal móvil se cierra únicamente si Canva se proyectó correctamente');
  console.log('[ok] al volver quedan visibles los controles/páginas del Canva');
  console.log('[ok] PC conserva el modal abierto después de proyectar');
  console.log('CANVA MOBILE CLOSE AFTER PROJECT V1 OK: prueba Pantallas / Proyectar desde el teléfono.');
} catch (error) {
  fs.writeFileSync(filePath, original, 'utf8');
  console.error('[rollback] ProyectorController.jsx restaurado al estado previo.');
  throw error;
}
