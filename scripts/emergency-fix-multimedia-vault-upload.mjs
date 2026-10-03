import fs from 'node:fs';

const filePath = 'src/components/live/ProyectorController.jsx';
if (!fs.existsSync(filePath)) throw new Error('No existe ProyectorController.jsx.');

const raw = fs.readFileSync(filePath, 'utf8');
const eol = raw.includes('\r\n') ? '\r\n' : '\n';
let source = raw.replace(/\r\n/g, '\n');
const original = source;

const uploadNeedle = `        const nuevaLib = [...multimediaLib, { 
          url, 
        type: uploaded.type || fileType, 
          name: file.name,
          folder: currentFolder || 'root'
        }];

        await setDoc(doc(db, 'sistema', 'multimedia'), { 
          multimediaLib: nuevaLib 
        }, { merge: true });`;

const uploadReplacement = `        const newVaultItem = {
          url,
          type: uploaded.type || fileType,
          name: file.name,
          folder: currentFolder || 'root'
        };

        await runTransaction(db, async (transaction) => {
          const vaultRef = doc(db, 'sistema', 'multimedia');
          const vaultSnap = await transaction.get(vaultRef);
          const serverLibrary = vaultSnap.exists() && Array.isArray(vaultSnap.data()?.multimediaLib)
            ? vaultSnap.data().multimediaLib.filter((item) => item && typeof item === 'object')
            : [];
          const alreadyExists = serverLibrary.some((item) => String(item?.url || '') === String(newVaultItem.url || ''));
          transaction.set(vaultRef, {
            multimediaLib: alreadyExists ? serverLibrary : [...serverLibrary, newVaultItem]
          }, { merge: true });
        });`;

if (source.includes(uploadReplacement)) {
  console.log('[skip] subida transaccional: ya aplicada.');
} else if (source.includes(uploadNeedle)) {
  source = source.replace(uploadNeedle, uploadReplacement);
  console.log('[ok] subida transaccional de Bóveda');
} else {
  throw new Error('No se encontró el bloque de subida esperado.');
}

const recoveryNeedle = `      const needsLegacyRecovery = !snap.exists()
        || current.library.length === 0
        || current.folders.length === 0;
      if (!needsLegacyRecovery) return;

      getDoc(doc(db, 'eventos', 'global')).then(async (oldSnap) => {
        if (!oldSnap.exists()) return;
        const legacy = normalizeVaultData(oldSnap.data());`;

const recoveryReplacement = `      getDoc(doc(db, 'eventos', 'global')).then(async (oldSnap) => {
        if (!oldSnap.exists()) return;
        const legacy = normalizeVaultData(oldSnap.data());
        const needsLegacyRecovery = !snap.exists()
          || current.library.length === 0
          || current.folders.length === 0
          || current.library.length < legacy.library.length;
        if (!needsLegacyRecovery) return;`;

if (source.includes(recoveryReplacement)) {
  console.log('[skip] recuperación de Bóveda: ya aplicada.');
} else if (source.includes(recoveryNeedle)) {
  source = source.replace(recoveryNeedle, recoveryReplacement);
  console.log('[ok] recuperación legacy reforzada');
} else {
  throw new Error('No se encontró el bloque de recuperación esperado.');
}

if (!source.includes('await runTransaction(db, async (transaction) => {')) throw new Error('Validación falló: transacción no aplicada.');
if (!source.includes('current.library.length < legacy.library.length')) throw new Error('Validación falló: recuperación no aplicada.');

try {
  fs.writeFileSync(filePath, source.replace(/\n/g, eol), 'utf8');
  console.log('Fix de emergencia aplicado: subir ya no reemplaza toda la Bóveda y se intenta recuperar contenido legacy faltante.');
} catch (error) {
  fs.writeFileSync(filePath, original.replace(/\n/g, eol), 'utf8');
  throw error;
}
