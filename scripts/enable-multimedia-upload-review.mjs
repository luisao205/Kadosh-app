import fs from 'node:fs';

const filePath = 'src/components/live/ProyectorController.jsx';
if (!fs.existsSync(filePath)) throw new Error('No existe ProyectorController.jsx.');

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

if (!source.includes('KADOSH_MULTIMEDIA_BATCH_UPLOAD_V1')) {
  throw new Error('Primero ejecuta scripts/enable-multimedia-batch-upload.mjs');
}

// 1) Estado de revisión previa.
replaceExact(
  `  const [uploadingFiles, setUploadingFiles] = useState([]); // [{id, name, type}]\n  const [multimediaFolders, setMultimediaFolders] = useState([]);`,
  `  const [uploadingFiles, setUploadingFiles] = useState([]); // [{id, name, type}]\n  // KADOSH_MULTIMEDIA_UPLOAD_REVIEW_V1\n  const [pendingVaultUploads, setPendingVaultUploads] = useState([]);\n  const [showVaultUploadReview, setShowVaultUploadReview] = useState(false);\n  const [multimediaFolders, setMultimediaFolders] = useState([]);`,
  'estado de revisión previa de Bóveda'
);

// 2) Helpers para previsualizar, quitar y confirmar antes de subir.
const functionStart = '  // KADOSH_MULTIMEDIA_BATCH_UPLOAD_V1\n  const handleUploadBackground = async (e, { applyAsBackground = false } = {}) => {';
if (!source.includes(functionStart)) throw new Error('No se encontró la subida múltiple V1.');

const reviewHelpers = `  const clearPendingVaultUploads = () => {\n    setPendingVaultUploads((current) => {\n      current.forEach((item) => {\n        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);\n      });\n      return [];\n    });\n  };\n\n  const closeVaultUploadReview = () => {\n    if (isUploadingFondo) return;\n    clearPendingVaultUploads();\n    setShowVaultUploadReview(false);\n  };\n\n  const removePendingVaultUpload = (id) => {\n    if (isUploadingFondo) return;\n    setPendingVaultUploads((current) => {\n      const removed = current.find((item) => item.id === id);\n      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);\n      const next = current.filter((item) => item.id !== id);\n      if (!next.length) setShowVaultUploadReview(false);\n      return next;\n    });\n  };\n\n  const stageVaultUploadFiles = (event) => {\n    if (!canUploadMedia) {\n      notify('No tienes permiso para subir Multimedia.', { type: 'error' });\n      return;\n    }\n    const selected = Array.from(event.target.files || []);\n    event.target.value = '';\n    if (!selected.length) return;\n\n    const validFiles = selected.filter((file) => file?.type?.startsWith('image/') || file?.type?.startsWith('video/'));\n    const rejected = selected.length - validFiles.length;\n    if (!validFiles.length) {\n      notify('Selecciona imágenes o videos compatibles.', { type: 'error' });\n      return;\n    }\n\n    clearPendingVaultUploads();\n    const token = Date.now();\n    const staged = validFiles.map((file, index) => ({\n      id: \`${'${token}'}-${'${index}'}-${'${file.name}'}\`,\n      file,\n      name: file.name,\n      size: file.size,\n      type: file.type.startsWith('video/') ? 'video' : 'image',\n      previewUrl: URL.createObjectURL(file),\n    }));\n    setPendingVaultUploads(staged);\n    setShowVaultUploadReview(true);\n    if (rejected) notify(\`${'${rejected}'} archivo${'${rejected === 1 ? \'\' : \'s\'}'} no compatible${'${rejected === 1 ? \'\' : \'s\'}'} ignorado${'${rejected === 1 ? \'\' : \'s\'}'}.\`, { type: 'warning' });\n  };\n\n  const confirmVaultUploadReview = async () => {\n    if (!pendingVaultUploads.length || isUploadingFondo) return;\n    const files = pendingVaultUploads.map((item) => item.file);\n    try {\n      await handleUploadBackground(\n        { target: { files, value: '' } },\n        { applyAsBackground: false }\n      );\n      clearPendingVaultUploads();\n      setShowVaultUploadReview(false);\n    } catch (error) {\n      console.error('Error confirmando subida a Bóveda:', error);\n    }\n  };\n\n`;

if (source.includes('const stageVaultUploadFiles = (event) => {')) {
  console.log('[skip] helpers de revisión previa: ya aplicados.');
} else {
  source = source.replace(functionStart, reviewHelpers + functionStart);
  console.log('[ok] revisión previa antes de subir');
}

// 3) Ambos selectores de Bóveda deben abrir la revisión, no subir inmediatamente.
replaceExact(
  `                      onChange={(event) => handleUploadBackground(event, { applyAsBackground: false })}`,
  `                      onChange={stageVaultUploadFiles}`,
  'selector desktop abre revisión previa'
);
replaceExact(
  `                    <input type="file" multiple accept="video/mp4, video/webm, image/jpeg, image/png, image/gif" className="hidden" disabled={isUploadingFondo || !canUploadMedia} onChange={handleUploadBackground} />`,
  `                    <input type="file" multiple accept="video/mp4, video/webm, image/jpeg, image/png, image/gif" className="hidden" disabled={isUploadingFondo || !canUploadMedia} onChange={stageVaultUploadFiles} />`,
  'selector móvil abre revisión previa'
);

// 4) Modal de revisión: miniaturas/videos, quitar individual, cancelar o confirmar.
const modalAnchor = `      {showFondosModal && (`;
const reviewModalMarker = '{/* KADOSH_MULTIMEDIA_UPLOAD_REVIEW_MODAL_V1 */}';
if (source.includes(reviewModalMarker)) {
  console.log('[skip] modal de revisión previa: ya aplicado.');
} else {
  if (!source.includes(modalAnchor)) throw new Error('No se encontró el modal de fondos para insertar revisión.');
  const reviewModal = `      {/* KADOSH_MULTIMEDIA_UPLOAD_REVIEW_MODAL_V1 */}\n      {showVaultUploadReview && (\n        <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/85 p-3 sm:p-5">\n          <div className="flex max-h-[92dvh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-violet-400/20 bg-zinc-950 shadow-2xl">\n            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-white/10 p-4 sm:p-5">\n              <div>\n                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-violet-300">Revisar antes de subir</p>\n                <h3 className="mt-1 text-lg font-black text-white">${'${pendingVaultUploads.length}'} archivo${'${pendingVaultUploads.length === 1 ? \'\' : \'s\'}'} seleccionado${'${pendingVaultUploads.length === 1 ? \'\' : \'s\'}'}</h3>\n                <p className="mt-1 text-xs font-bold text-zinc-500">Quita cualquier imagen o video incorrecto. Nada se sube hasta confirmar.</p>\n              </div>\n              <button type="button" disabled={isUploadingFondo} onClick={closeVaultUploadReview} className="rounded-xl border border-white/10 bg-white/5 p-2 text-zinc-400 hover:text-white disabled:opacity-40"><X size={18}/></button>\n            </div>\n\n            <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">\n              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">\n                {pendingVaultUploads.map((item) => (\n                  <div key={item.id} className="overflow-hidden rounded-2xl border border-white/10 bg-black/35">\n                    <div className="relative aspect-video bg-black">\n                      {item.type === 'video' ? (\n                        <video src={item.previewUrl} controls muted playsInline preload="metadata" className="h-full w-full object-contain" />\n                      ) : (\n                        <img src={item.previewUrl} alt={item.name} className="h-full w-full object-contain" />\n                      )}\n                      <button\n                        type="button"\n                        disabled={isUploadingFondo}\n                        onClick={() => removePendingVaultUpload(item.id)}\n                        className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full border border-red-300/25 bg-red-600/90 text-white shadow-lg disabled:opacity-40"\n                        title="Quitar de la subida"\n                      >\n                        <X size={15}/>\n                      </button>\n                    </div>\n                    <div className="p-2.5">\n                      <p className="truncate text-[10px] font-black text-white" title={item.name}>{item.name}</p>\n                      <p className="mt-1 text-[9px] font-bold uppercase text-zinc-600">{item.type === 'video' ? 'Video' : 'Imagen'} · {(item.size / (1024 * 1024)).toFixed(1)} MB</p>\n                    </div>\n                  </div>\n                ))}\n              </div>\n            </div>\n\n            <div className="grid shrink-0 grid-cols-2 gap-2 border-t border-white/10 bg-zinc-950/95 p-4 sm:p-5">\n              <button type="button" disabled={isUploadingFondo} onClick={closeVaultUploadReview} className="min-h-12 rounded-xl border border-white/10 bg-white/5 text-xs font-black uppercase text-zinc-300 disabled:opacity-40">Cancelar</button>\n              <button type="button" disabled={isUploadingFondo || !pendingVaultUploads.length} onClick={confirmVaultUploadReview} className="min-h-12 rounded-xl bg-violet-600 text-xs font-black uppercase text-white shadow-lg shadow-violet-950/30 disabled:opacity-40">\n                {isUploadingFondo ? 'Subiendo…' : \`Subir ${'${pendingVaultUploads.length}'} archivo${'${pendingVaultUploads.length === 1 ? \'\' : \'s\'}'}\`}\n              </button>\n            </div>\n          </div>\n        </div>\n      )}\n\n`;
  source = source.replace(modalAnchor, reviewModal + modalAnchor);
  console.log('[ok] modal con vista previa y quitar archivos');
}

if (!source.includes('KADOSH_MULTIMEDIA_UPLOAD_REVIEW_V1')) throw new Error('Validación falló: estado de revisión no aplicado.');
if (!source.includes('KADOSH_MULTIMEDIA_UPLOAD_REVIEW_MODAL_V1')) throw new Error('Validación falló: modal de revisión no aplicado.');
if (!source.includes('onChange={stageVaultUploadFiles}')) throw new Error('Validación falló: selectores aún no usan revisión previa.');

try {
  fs.writeFileSync(filePath, source.replace(/\n/g, eol), 'utf8');
  console.log('Revisión previa aplicada: selecciona varios archivos, previsualiza, quita los incorrectos y luego confirma la subida.');
} catch (error) {
  fs.writeFileSync(filePath, original.replace(/\n/g, eol), 'utf8');
  throw error;
}
