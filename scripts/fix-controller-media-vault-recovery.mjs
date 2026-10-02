import fs from 'node:fs';

const target = 'src/components/live/ProyectorController.jsx';
const raw = fs.readFileSync(target, 'utf8');
const eol = raw.includes('\r\n') ? '\r\n' : '\n';
let source = raw.replace(/\r\n/g, '\n');

const replaceOnce = (text, needle, replacement, label) => {
  if (text.includes(replacement)) {
    console.log('[skip] ' + label + ': ya aplicado.');
    return text;
  }
  const index = text.indexOf(needle);
  if (index === -1) throw new Error('No se encontró: ' + label);
  console.log('[ok] ' + label);
  return text.slice(0, index) + replacement + text.slice(index + needle.length);
};

const oldBlock = `    // 1. Escuchar la Bóveda Multimedia Global
    const unsubLib = onSnapshot(doc(db, 'sistema', 'multimedia'), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setMultimediaLib(data.multimediaLib || []);
        setMultimediaFolders(data.multimediaFolders || []);
        
        // MIGRACION REFORZADA: Si el doc existe pero las carpetas no, intentamos traerlas de 'global'
        if (!data.multimediaFolders || data.multimediaFolders.length === 0) {
          getDoc(doc(db, 'eventos', 'global')).then(oldSnap => {
            if (oldSnap.exists() && oldSnap.data().multimediaFolders) {
              setDoc(doc(db, 'sistema', 'multimedia'), {
                multimediaFolders: oldSnap.data().multimediaFolders || []
              }, { merge: true });
            }
          });
        }
      } 
      else {
        // MIGRACION: Si el nuevo documento no existe, intentamos recuperar del antiguo 'global'
        getDoc(doc(db, 'eventos', 'global')).then(oldSnap => {
          if (oldSnap.exists() && oldSnap.data().multimediaLib) {
            setDoc(doc(db, 'sistema', 'multimedia'), {
              multimediaLib: oldSnap.data().multimediaLib || [],
              multimediaFolders: oldSnap.data().multimediaFolders || []
            }, { merge: true });
          }
        });
      }
    });`;

const newBlock = `    // 1. Escuchar la Bóveda Multimedia Global.
    // Recuperación no destructiva: conserva lo nuevo, deriva carpetas desde los medios
    // y completa desde eventos/global solo cuando la bóveda actual está incompleta.
    const normalizeVaultData = (data = {}) => {
      const library = Array.isArray(data.multimediaLib)
        ? data.multimediaLib.filter((item) => item && typeof item === 'object')
        : [];
      const explicitFolders = Array.isArray(data.multimediaFolders)
        ? data.multimediaFolders
            .filter((folder) => typeof folder === 'string')
            .map((folder) => folder.trim())
            .filter(Boolean)
        : [];
      const foldersFromMedia = library
        .map((item) => (typeof item?.folder === 'string' ? item.folder.trim() : ''))
        .filter(Boolean);
      return {
        library,
        folders: [...new Set([...explicitFolders, ...foldersFromMedia])],
      };
    };

    const mergeVaultLibraries = (primary = [], legacy = []) => {
      const result = [];
      const seen = new Set();
      [...primary, ...legacy].forEach((item) => {
        if (!item || typeof item !== 'object') return;
        const identity = String(item.url || item.publicId || item.id || '').trim();
        if (identity && seen.has(identity)) return;
        if (identity) seen.add(identity);
        result.push(item);
      });
      return result;
    };

    const unsubLib = onSnapshot(doc(db, 'sistema', 'multimedia'), (snap) => {
      const current = normalizeVaultData(snap.exists() ? snap.data() : {});
      setMultimediaLib(current.library);
      setMultimediaFolders(current.folders);

      const needsLegacyRecovery = !snap.exists()
        || current.library.length === 0
        || current.folders.length === 0;
      if (!needsLegacyRecovery) return;

      getDoc(doc(db, 'eventos', 'global')).then(async (oldSnap) => {
        if (!oldSnap.exists()) return;
        const legacy = normalizeVaultData(oldSnap.data());
        const mergedLibrary = mergeVaultLibraries(current.library, legacy.library);
        const mergedFolders = [...new Set([
          ...current.folders,
          ...legacy.folders,
          ...mergedLibrary
            .map((item) => (typeof item?.folder === 'string' ? item.folder.trim() : ''))
            .filter(Boolean),
        ])];

        setMultimediaLib(mergedLibrary);
        setMultimediaFolders(mergedFolders);

        const libraryChanged = mergedLibrary.length !== current.library.length;
        const foldersChanged = mergedFolders.length !== current.folders.length
          || mergedFolders.some((folder, index) => folder !== current.folders[index]);
        if (!libraryChanged && !foldersChanged) return;

        await setDoc(doc(db, 'sistema', 'multimedia'), {
          multimediaLib: mergedLibrary,
          multimediaFolders: mergedFolders,
        }, { merge: true });
        console.info('[Bóveda] recuperación legacy aplicada sin eliminar contenido actual.');
      }).catch((error) => {
        console.error('Error recuperando Bóveda Multimedia legacy:', error);
      });
    });`;

source = replaceOnce(source, oldBlock, newBlock, 'recuperación segura de Bóveda Multimedia');

for (const marker of [
  'const normalizeVaultData = (data = {}) => {',
  'const mergeVaultLibraries = (primary = [], legacy = []) => {',
  "getDoc(doc(db, 'eventos', 'global')).then(async (oldSnap) => {",
  'foldersFromMedia',
  'recuperación legacy aplicada sin eliminar contenido actual',
]) {
  if (!source.includes(marker)) throw new Error('Validación interna falló: ' + marker);
}

fs.writeFileSync(target, source.replace(/\n/g, eol), 'utf8');
console.log('Fix Bóveda Multimedia aplicado: carpetas derivadas + recuperación no destructiva desde legacy.');
