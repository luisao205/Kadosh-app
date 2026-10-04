import fs from 'node:fs';

const filePath = 'src/components/live/ProyectorController.jsx';
if (!fs.existsSync(filePath)) throw new Error('No existe ProyectorController.jsx.');

const raw = fs.readFileSync(filePath, 'utf8');
const eol = raw.includes('\r\n') ? '\r\n' : '\n';
let source = raw.replace(/\r\n/g, '\n');
const original = source;

try {
  const brokenStart = '        {showMobileCanvaEditor && createPortal((';
  const fixedStart = '        {showMobileCanvaEditor && createPortal(';

  if (source.includes(brokenStart)) {
    source = source.replace(brokenStart, fixedStart);
    console.log('[ok] apertura createPortal normalizada sin paréntesis duplicado');
  } else if (source.includes(fixedStart)) {
    console.log('[skip] apertura createPortal: ya normalizada');
  } else {
    throw new Error('No se encontró el portal Canva aplicado por V1.');
  }

  const modalStart = source.indexOf(fixedStart);
  if (modalStart < 0) throw new Error('No se encontró inicio del modal Canva.');

  const saveMarker = 'onClick={saveCanvaPresentation}';
  const saveIndex = source.indexOf(saveMarker, modalStart);
  if (saveIndex < 0) throw new Error('No se encontró botón Guardar del modal Canva.');

  // El portal debe cerrar justo después del contenedor del modal, no en otro bloque
  // posterior. Anclamos el cierre al botón Guardar para no depender del bloque Biblia.
  const plainClose = '              </div>\n            </div>\n          </div>\n        )}';
  const groupedPortalClose = '              </div>\n            </div>\n          </div>\n        ), document.body)}';
  const directPortalClose = '              </div>\n            </div>\n          </div>\n        , document.body)}';

  const plainIndex = source.indexOf(plainClose, saveIndex);
  const groupedIndex = source.indexOf(groupedPortalClose, saveIndex);
  const directIndex = source.indexOf(directPortalClose, saveIndex);

  if (plainIndex >= 0) {
    source = source.slice(0, plainIndex)
      + directPortalClose
      + source.slice(plainIndex + plainClose.length);
    console.log('[ok] cierre del portal Canva colocado en el modal correcto');
  } else if (groupedIndex >= 0) {
    source = source.slice(0, groupedIndex)
      + directPortalClose
      + source.slice(groupedIndex + groupedPortalClose.length);
    console.log('[ok] cierre del portal Canva simplificado');
  } else if (directIndex >= 0) {
    console.log('[skip] cierre del portal Canva: ya correcto');
  } else {
    throw new Error('No se encontró el cierre estructural del modal Canva después de Guardar.');
  }

  // Si V1 dejó un cierre de portal adicional después del modal, retirarlo.
  const intendedCloseIndex = source.indexOf(directPortalClose, saveIndex);
  if (intendedCloseIndex < 0) throw new Error('No quedó el cierre directo del portal Canva.');
  const tailStart = intendedCloseIndex + directPortalClose.length;
  const tail = source.slice(tailStart);
  if (tail.includes('), document.body)}')) {
    source = source.slice(0, tailStart) + tail.replace('), document.body)}', ')}');
    console.log('[ok] cierre de portal sobrante eliminado');
  }

  const portalStartCount = source.split('showMobileCanvaEditor && createPortal(').length - 1;
  const portalCloseCount = source.split(', document.body)}').length - 1;
  if (portalStartCount !== 1) throw new Error(`Se esperaba un portal Canva y se encontraron ${portalStartCount}.`);
  if (portalCloseCount !== 1) throw new Error(`Se esperaba un cierre document.body y se encontraron ${portalCloseCount}.`);
  if (source.includes('showMobileCanvaEditor && createPortal((')) {
    throw new Error('Quedó la apertura createPortal con doble paréntesis.');
  }
  if (!source.includes('onClick={openMobileCanvaCreate}')) throw new Error('Nueva perdió su handler.');
  if (!source.includes('openMobileCanvaEdit(item)')) throw new Error('Editar perdió su handler.');
  if (!source.includes(saveMarker)) throw new Error('Guardar perdió su handler.');

  fs.writeFileSync(filePath, source.replace(/\n/g, eol), 'utf8');
  console.log('[ok] Nueva/Editar conservan sus handlers');
  console.log('[ok] portal Canva listo para PC y móvil');
  console.log('CANVA MODAL PORTAL V2 OK: ejecuta npm run build.');
} catch (error) {
  fs.writeFileSync(filePath, original, 'utf8');
  console.error('[rollback] ProyectorController.jsx restaurado al estado previo de V2.');
  throw error;
}
