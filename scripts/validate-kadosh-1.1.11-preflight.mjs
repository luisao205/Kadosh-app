import fs from 'node:fs';

const filePath = 'src/components/live/ProyectorController.jsx';
if (!fs.existsSync(filePath)) throw new Error('No existe ProyectorController.jsx.');

const source = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');

const checks = [
  ['subida segura a Bóveda', 'KADOSH_SAFE_VAULT_UPLOAD_V1'],
  ['controles por salida', 'KADOSH_MEDIA_PER_OUTPUT_CONTROLS_V1'],
  ['subida múltiple', 'KADOSH_MULTIMEDIA_BATCH_UPLOAD_V1'],
  ['revisión previa', 'KADOSH_MULTIMEDIA_UPLOAD_REVIEW_V1'],
  ['modal de revisión previa', 'KADOSH_MULTIMEDIA_UPLOAD_REVIEW_MODAL_V1'],
  ['selector de revisión previa', 'onChange={stageVaultUploadFiles}'],
  ['selector múltiple', 'multiple'],
  ['control independiente visible', 'renderMediaOutputControls({ compact: true })'],
  ['pre-proyección Multimedia con altura propia', "projectionSourceMode === 'media' ? 'min-h-[360px]' : 'min-h-[260px]'"],
  ['selector Multimedia compacto', 'renderMediaTargetSelector({ compact: true })'],
];

for (const [label, marker] of checks) {
  if (!source.includes(marker)) throw new Error(`Falta: ${label}`);
  console.log(`[ok] ${label}`);
}

const declarationIndex = source.indexOf("const canProjectPreaching = hasPermission(user, 'sermons.project');");
const useIndex = source.indexOf('const canHandlePastorRequests = canProjectPreaching;');
if (declarationIndex < 0 || useIndex < 0 || declarationIndex > useIndex) {
  throw new Error('El orden de inicialización de permisos del Controlador no está corregido.');
}
console.log('[ok] orden de permisos del Controlador');

const unsafeVaultButton = '<button onClick={() => setShowFondosModal(true)} className="text-[10px] font-bold text-indigo-400 hover:text-indigo-300 flex items-center gap-1"><Upload size={12}/> Subir Medios</button>';
if (source.includes(unsafeVaultButton)) {
  throw new Error('Subir Medios todavía abre el modal de Fondo.');
}
console.log('[ok] Subir Medios no abre modal de Fondo');

const oldDirectDesktopUpload = 'onChange={(event) => handleUploadBackground(event, { applyAsBackground: false })}';
if (source.includes(oldDirectDesktopUpload)) {
  throw new Error('El selector desktop todavía sube directo sin revisión previa.');
}
console.log('[ok] desktop usa revisión previa');

const oldDirectMobileUpload = 'onChange={handleUploadBackground} />';
if (source.includes(oldDirectMobileUpload)) {
  throw new Error('Existe un selector de Bóveda que todavía sube directo sin revisión previa.');
}
console.log('[ok] móvil/tablet usa revisión previa');

console.log('PRECHECK 1.1.11 OK: Controlador, subida segura/múltiple, revisión previa, controles por pantalla y layout Multimedia están presentes.');
