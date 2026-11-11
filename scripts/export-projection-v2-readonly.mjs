import { createRequire } from 'node:module';
import { constants } from 'node:fs';
import { access, readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { createBackup, sanitizeEvent, sanitizeSong, SOURCE_PROJECT_ID, validateBackup } from './projection-v2-backup-lib.mjs';

function argsFrom(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 2) result[argv[index]?.replace(/^--/, '')] = argv[index + 1];
  return result;
}

const args = argsFrom(process.argv.slice(2));
if (args['source-project'] !== SOURCE_PROJECT_ID) throw new Error(`--source-project must be ${SOURCE_PROJECT_ID}.`);
if (!args.output) throw new Error('--output is required.');
if (!args['adc-file']) throw new Error('--adc-file is required. It must be an approved impersonated-service-account ADC file.');
if (!args['expected-principal']) throw new Error('--expected-principal is required.');
if (args['read-only-identity-approved'] !== 'true') throw new Error('--read-only-identity-approved true is required after IAM review.');
for (const name of ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST', 'FUNCTIONS_EMULATOR_HOST']) {
  if (process.env[name]) throw new Error(`${name} must not be set for a production read-only export.`);
}
if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  throw new Error('Refusing to use ambient GOOGLE_APPLICATION_CREDENTIALS. Pass the approved file with --adc-file.');
}

const output = resolve(args.output);
const relativeToWorkspace = relative(resolve('.'), output);
if (relativeToWorkspace === ''
    || (relativeToWorkspace !== '..' && !relativeToWorkspace.startsWith(`..${sep}`) && !isAbsolute(relativeToWorkspace))) {
  throw new Error('Output must be outside the workspace.');
}
if (/[\\/]OneDrive(?:\s+-[^\\/]*)?[\\/]/i.test(output)) {
  throw new Error('Output must be outside OneDrive.');
}
try {
  await access(output, constants.F_OK);
  throw new Error(`Refusing to overwrite existing file: ${output}`);
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

const require = createRequire(import.meta.url);
const admin = require('../functions/node_modules/firebase-admin');
const adcPath = resolve(args['adc-file']);
const adc = JSON.parse(await readFile(adcPath, 'utf8'));
if (adc.type !== 'impersonated_service_account') throw new Error('ADC type must be impersonated_service_account.');
const impersonationUrl = adc.service_account_impersonation_url;
const expectedPrincipalMatches = typeof impersonationUrl === 'string'
  && (impersonationUrl.includes(args['expected-principal'])
    || impersonationUrl.includes(encodeURIComponent(args['expected-principal'])));
if (!expectedPrincipalMatches) {
  throw new Error('ADC impersonated principal does not match --expected-principal.');
}
if (JSON.stringify(adc).includes('private_key')) throw new Error('Persistent private keys are forbidden.');

// Scoped to this process only; it does not alter the user's global ADC configuration.
process.env.GOOGLE_APPLICATION_CREDENTIALS = adcPath;
const credential = admin.credential.applicationDefault();

const app = admin.initializeApp({ projectId: SOURCE_PROJECT_ID, credential }, `projection-v2-readonly-${Date.now()}`);
try {
  const firestore = app.firestore();
  const [songSnapshot, eventSnapshot] = await Promise.all([
    firestore.collection('canciones').get(),
    firestore.collection('eventos').get(),
  ]);
  const backup = createBackup({
    songs: songSnapshot.docs.map((document) => sanitizeSong(document.id, document.data())),
    events: eventSnapshot.docs.map((document) => sanitizeEvent(document.id, document.data())),
  });
  const validation = validateBackup(backup);
  if (!validation.ok) throw new Error(`Backup validation failed (${validation.errors.length} errors).`);
  await writeFile(output, `${JSON.stringify(backup, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  console.log(JSON.stringify({ output, counts: validation.counts, sha256: backup.manifest.sha256 }));
} finally {
  await app.delete();
}

