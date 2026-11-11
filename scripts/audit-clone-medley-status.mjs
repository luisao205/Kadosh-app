import { createRequire } from 'node:module';
import { getSongLogicStatus, SONG_LOGIC_STATUS } from '../src/utils/songLogicStatus.js';

const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
if (!/^127\.0\.0\.1:\d+$/.test(emulatorHost || '')) {
  throw new Error('La auditoria requiere FIRESTORE_EMULATOR_HOST en localhost.');
}

const require = createRequire(import.meta.url);
const admin = require('../functions/node_modules/firebase-admin');
const app = admin.apps.find((candidate) => candidate?.name === 'clone-status-audit')
  || admin.initializeApp({ projectId: 'kadosh-49600' }, 'clone-status-audit');
const firestore = app.firestore();

function repairReason(song) {
  const config = song.medleyConfig || {};
  const parts = Array.isArray(config.songs) ? config.songs : [];
  const indexes = Array.isArray(config.sectionPartIndexes) ? config.sectionPartIndexes : [];

  if (config.manualEdited === true) return 'contenido marcado como editado manualmente';
  if (!parts.length || !indexes.length) return 'configuracion de partes o secciones incompleta';
  if (config.transposeMode === 'UNIFIED') {
    const expected = config.unifiedKey;
    if (!expected || parts.some((part) => (part?.materializedKey || part?.medleyKey) !== expected)) {
      return 'tono unificado no coincide con las partes materializadas';
    }
  }
  return 'estructura de medley invalida o incompleta';
}

const snapshot = await firestore.collection('canciones').get();
const medleys = snapshot.docs
  .map((document) => ({ id: document.id, ...document.data() }))
  .filter((song) => song.medleyConfig);
const counts = {
  [SONG_LOGIC_STATUS.CURRENT]: 0,
  [SONG_LOGIC_STATUS.LEGACY]: 0,
  [SONG_LOGIC_STATUS.NEEDS_REPAIR]: 0,
};
const needsRepair = [];

for (const song of medleys) {
  const status = getSongLogicStatus(song);
  counts[status] += 1;
  if (status === SONG_LOGIC_STATUS.NEEDS_REPAIR) {
    needsRepair.push({
      id: song.id,
      title: song.titulo || 'Sin titulo',
      reason: repairReason(song),
    });
  }
}

console.log(JSON.stringify({
  totalMedleys: medleys.length,
  current: counts[SONG_LOGIC_STATUS.CURRENT],
  legacy: counts[SONG_LOGIC_STATUS.LEGACY],
  needsRepair: counts[SONG_LOGIC_STATUS.NEEDS_REPAIR],
  repairDocuments: needsRepair,
}, null, 2));

await app.delete();
