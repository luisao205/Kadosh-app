import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { decodeFirestoreValue, DEMO_PROJECT_ID, validateBackup } from './projection-v2-backup-lib.mjs';

function argsFrom(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 2) result[argv[index]?.replace(/^--/, '')] = argv[index + 1];
  return result;
}

const args = argsFrom(process.argv.slice(2));
if (args.project !== DEMO_PROJECT_ID) throw new Error(`--project must be ${DEMO_PROJECT_ID}.`);
if (!args.input) throw new Error('--input is required.');
if (!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '')) throw new Error('FIRESTORE_EMULATOR_HOST must point to 127.0.0.1.');
if (process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.FIREBASE_TOKEN || process.env.CLOUDSDK_AUTH_ACCESS_TOKEN) {
  throw new Error('Real credential environment variables are forbidden during DEMO import.');
}
if (process.env.GCLOUD_PROJECT && process.env.GCLOUD_PROJECT !== DEMO_PROJECT_ID) throw new Error('GCLOUD_PROJECT is ambiguous.');
if (process.env.GOOGLE_CLOUD_PROJECT && process.env.GOOGLE_CLOUD_PROJECT !== DEMO_PROJECT_ID) throw new Error('GOOGLE_CLOUD_PROJECT is ambiguous.');

const backup = JSON.parse(await readFile(resolve(args.input), 'utf8'));
const validation = validateBackup(backup);
if (!validation.ok) throw new Error(`Backup validation failed:\n${validation.errors.join('\n')}`);

const require = createRequire(import.meta.url);
const admin = require('../functions/node_modules/firebase-admin');
const app = admin.initializeApp({ projectId: DEMO_PROJECT_ID }, `projection-v2-demo-import-${Date.now()}`);
try {
  const firestore = app.firestore();
  const records = [
    ...backup.collections.canciones.map((document) => ({ collection: 'canciones', ...document })),
    ...backup.collections.eventos.map((document) => ({ collection: 'eventos', ...document })),
  ];
  const references = records.map((record) => firestore.collection(record.collection).doc(record.id));
  const existing = references.length ? await firestore.getAll(...references) : [];
  const collisions = existing.filter((snapshot) => snapshot.exists).map((snapshot) => snapshot.ref.path);
  if (collisions.length) throw new Error(`Refusing to overwrite ${collisions.length} existing documents. First: ${collisions[0]}`);

  for (let offset = 0; offset < records.length; offset += 400) {
    const batch = firestore.batch();
    records.slice(offset, offset + 400).forEach((record) => {
      const ref = firestore.collection(record.collection).doc(record.id);
      batch.create(ref, decodeFirestoreValue(record.data, {
        Timestamp: admin.firestore.Timestamp,
        GeoPoint: admin.firestore.GeoPoint,
      }));
    });
    await batch.commit();
  }
  console.log(JSON.stringify({ imported: records.length, counts: validation.counts, projectId: DEMO_PROJECT_ID }));
} finally {
  await app.delete();
}

