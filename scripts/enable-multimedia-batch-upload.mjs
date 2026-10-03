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

// Requiere que el fix de subida segura a Bóveda ya esté aplicado.
if (!source.includes('KADOSH_SAFE_VAULT_UPLOAD_V1')) {
  throw new Error('Primero ejecuta scripts/fix-multimedia-safe-upload-per-output-controls.mjs');
}

const functionStart = '  const handleUploadBackground = async (e, { applyAsBackground = false } = {}) => {';
const functionEnd = '\n\n  const quitarFondo = async () => {';
const startIndex = source.indexOf(functionStart);
const endIndex = source.indexOf(functionEnd, startIndex);
if (startIndex === -1 || endIndex === -1) throw new Error('No se encontró handleUploadBackground completo.');

const currentFunction = source.slice(startIndex, endIndex);
const batchMarker = 'KADOSH_MULTIMEDIA_BATCH_UPLOAD_V1';
if (currentFunction.includes(batchMarker)) {
  console.log('[skip] subida múltiple: ya aplicada.');
} else {
  const batchFunction = `  // KADOSH_MULTIMEDIA_BATCH_UPLOAD_V1\n  const handleUploadBackground = async (e, { applyAsBackground = false } = {}) => {\n    if (!canUploadMedia) {\n      notify('No tienes permiso para subir Multimedia.', { type: 'error' });\n      return;\n    }\n\n    const incomingFiles = Array.from(e.target.files || []);\n    if (!incomingFiles.length) return;\n\n    // Un fondo solo puede ser uno. La Bóveda sí acepta selección múltiple.\n    const files = applyAsBackground ? incomingFiles.slice(0, 1) : incomingFiles;\n    const batchToken = Date.now();\n    const batchEntries = files.map((file, index) => ({\n      id: \`${'${batchToken}'}-${'${index}'}-${'${file.name}'}\`,\n      name: file.name,\n      type: file.type.startsWith('video') ? 'video' : 'image',\n      folder: currentFolder || 'root'\n    }));\n\n    setUploadingFiles(prev => [...prev, ...batchEntries]);\n    setIsUploadingFondo(true);\n\n    let uploadedCount = 0;\n    let failedCount = 0;\n    let lastBackground = null;\n\n    try {\n      // Secuencial a propósito: evita saturar Cloudinary y cada alta se protege con transacción.\n      for (let index = 0; index < files.length; index += 1) {\n        const file = files[index];\n        const fileType = file.type.startsWith('video') ? 'video' : 'image';\n        try {\n          const uploaded = await uploadToCloudinary(file, 'kadosh/projector-backgrounds');\n          const url = String(uploaded?.url || '').trim();\n          if (!url) throw new Error('Cloudinary no devolvió URL.');\n\n          const uploadedBackgroundMedia = {\n            title: file.name,\n            name: file.name,\n            type: uploaded.type || fileType,\n            url,\n            source: 'vault'\n          };\n          const newVaultItem = {\n            url,\n            type: uploaded.type || fileType,\n            name: file.name,\n            folder: currentFolder || 'root'\n          };\n\n          await runTransaction(db, async (transaction) => {\n            const vaultRef = doc(db, 'sistema', 'multimedia');\n            const vaultSnap = await transaction.get(vaultRef);\n            const serverLibrary = vaultSnap.exists() && Array.isArray(vaultSnap.data()?.multimediaLib)\n              ? vaultSnap.data().multimediaLib.filter((item) => item && typeof item === 'object')\n              : [];\n            const alreadyExists = serverLibrary.some((item) => String(item?.url || '') === url);\n            transaction.set(vaultRef, {\n              multimediaLib: alreadyExists ? serverLibrary : [...serverLibrary, newVaultItem]\n            }, { merge: true });\n          });\n\n          uploadedCount += 1;\n          lastBackground = { url, media: uploadedBackgroundMedia };\n        } catch (fileError) {\n          failedCount += 1;\n          console.error(\`Error subiendo ${'${file.name}'}\`, fileError);\n        } finally {\n          const entryId = batchEntries[index]?.id;\n          setUploadingFiles(prev => prev.filter(item => item.id !== entryId));\n        }\n      }\n\n      if (applyAsBackground && lastBackground) {\n        rememberUndoSnapshot();\n        await enqueueProjectionWrite(() => updateDoc(doc(db, 'eventos', eventoId), {\n          proyectorFondo: lastBackground.url,\n          proyectorFondoMedia: lastBackground.media,\n          projectorState: {\n            ...(evento?.projectorState || {}),\n            background: lastBackground.url,\n            backgroundMedia: lastBackground.media,\n            updatedAt: Date.now()\n          }\n        }));\n\n        if (eventoId !== 'global' && activeSongId && guardarEnCancion) {\n          await updateSongMetadata(activeSongId, { fondoUrl: lastBackground.url });\n          setCanciones(prev => prev.map(c => c.id === activeSongId ? { ...c, fondoUrl: lastBackground.url } : c));\n        }\n      }\n\n      if (!applyAsBackground && uploadedCount > 0) {\n        notify(\`${'${uploadedCount}'} archivo${'${uploadedCount === 1 ? \'\' : \'s\'}'} subido${'${uploadedCount === 1 ? \'\' : \'s\'}'} a la Bóveda.${'${failedCount ? ` ${failedCount} fallaron.` : \'\'}'}\`, {\n          type: failedCount ? 'warning' : 'success'\n        });\n      } else if (failedCount > 0 && uploadedCount === 0) {\n        notify('No se pudo subir ningún archivo. Inténtalo nuevamente.', { type: 'error' });\n      }\n    } finally {\n      setIsUploadingFondo(false);\n      if (applyAsBackground) setShowFondosModal(false);\n      setUploadingFiles(prev => prev.filter(item => !batchEntries.some(entry => entry.id === item.id)));\n      e.target.value = '';\n    }\n  };`;

  source = source.slice(0, startIndex) + batchFunction + source.slice(endIndex);
  console.log('[ok] subida múltiple segura a Bóveda');
}

// Desktop: selector seguro de la Bóveda admite muchos archivos.
replaceExact(
  `                      accept="video/mp4, video/webm, image/jpeg, image/png, image/gif"\n                      className="hidden"\n                      disabled={isUploadingFondo || !canUploadMedia}\n                      onChange={(event) => handleUploadBackground(event, { applyAsBackground: false })}`,
  `                      accept="video/mp4, video/webm, image/jpeg, image/png, image/gif"\n                      multiple\n                      className="hidden"\n                      disabled={isUploadingFondo || !canUploadMedia}\n                      onChange={(event) => handleUploadBackground(event, { applyAsBackground: false })}`,
  'selector múltiple en Subir Medios desktop'
);

// Mobile/tablet: el botón rápido de la Bóveda también admite selección múltiple.
replaceExact(
  `                    <input type="file" accept="video/mp4, video/webm, image/jpeg, image/png, image/gif" className="hidden" disabled={isUploadingFondo || !canUploadMedia} onChange={handleUploadBackground} />`,
  `                    <input type="file" multiple accept="video/mp4, video/webm, image/jpeg, image/png, image/gif" className="hidden" disabled={isUploadingFondo || !canUploadMedia} onChange={handleUploadBackground} />`,
  'selector múltiple en Bóveda móvil/tablet'
);

if (!source.includes(batchMarker)) throw new Error('Validación falló: subida múltiple no aplicada.');
if (!source.includes('multiple\n                      className="hidden"')) throw new Error('Validación falló: selector desktop no permite múltiples archivos.');

try {
  fs.writeFileSync(filePath, source.replace(/\n/g, eol), 'utf8');
  console.log('Subida múltiple aplicada: puedes seleccionar varias imágenes/videos y se agregan sin reemplazar la Bóveda ni los fondos existentes.');
} catch (error) {
  fs.writeFileSync(filePath, original.replace(/\n/g, eol), 'utf8');
  throw error;
}
