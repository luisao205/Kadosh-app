import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createBackup, sanitizeEvent, sanitizeSong, validateBackup } from './projection-v2-backup-lib.mjs';

const style = { preset: 'worship', motion: 'soft', alignment: 'center', backgroundTreatment: 'auto' };
const songs = [sanitizeSong('synthetic-song-a', {
  titulo: 'Synthetic Song A', artista: 'Fixture', letraRaw: '# Verso\n[C]Texto sintetico',
  tonoOriginal: 'C', projectionStyle: style, email: 'must-not-export@example.invalid',
  tonosAlternativos: { 'Personal Name': 'D', 'person@example.invalid': 'E' },
  fondoUrl: 'https://example.invalid/background.mp4',
  medleyConfig: {
    materializationVersion: 2, transposeMode: 'UNIFIED', unifiedKey: 'C',
    tonalProgression: ['C'], sectionPartIndexes: [0], manualEdited: false,
    songs: [{
      songId: 'synthetic-song-a', title: 'Synthetic Song A', originalKey: 'C',
      medleyKey: 'C', materializedKey: 'C', tonosPorCantante: { 'Personal Name': 'D' },
      email: 'nested@example.invalid', url: 'https://example.invalid/nested', uid: 'private-uid',
    }],
    unexpectedPersonalData: { name: 'Personal Name' },
  },
  sectionMedia: { Verso: [{ id: 'media-a', mediaId: 'library-a', title: 'Synthetic', url: 'https://example.invalid/media.mp4' }] },
})];
const events = [sanitizeEvent('synthetic-event-a', {
  titulo: 'Synthetic Event', setlist: [
    { idLocal: 'note-personal', type: 'note', value: 'Call Personal Name at personal@example.invalid' },
    { idLocal: 'one-private-uid', type: 'song', value: 'synthetic-song-a', email: 'excluded@example.invalid' },
    { idLocal: 'header-personal', type: 'header', value: 'Personal Name group' },
  ],
  canciones: ['synthetic-song-a'], songProjectionStyleOverrides: { 'synthetic-song-a': style },
  historicalSongSnapshots: {
    'historical-song': {
      titulo: 'Historical Synthetic', artista: 'Fixture', letraRaw: '# Verso\n[G]Historico',
      tonoOriginal: 'G', tonosAlternativos: { 'Another Person': 'A' },
      email: 'historical@example.invalid', uid: 'historical-uid',
      medleyConfig: {
        materializationVersion: 2, transposeMode: 'PER_SONG', unifiedKey: null,
        tonalProgression: ['G'], sectionPartIndexes: [0],
        songs: [{ songId: 'historical-song', originalKey: 'G', materializedKey: 'G', phone: '555-0100' }],
      },
    },
  },
  equipo: [{ id: 'private-user' }], projectorState: { type: 'lyrics' },
})];
const backup = createBackup({ songs, events, createdAt: '2026-01-01T00:00:00.000Z' });
assert.deepEqual(validateBackup(backup), { ok: true, errors: [], counts: { canciones: 1, eventos: 1 } });
assert.equal('email' in songs[0].data, false);
assert.equal('tonosAlternativos' in songs[0].data, false);
assert.equal('fondoUrl' in songs[0].data, false);
assert.equal('url' in songs[0].data.sectionMedia.Verso[0], false);
assert.deepEqual(Object.keys(songs[0].data.medleyConfig).sort(), [
  'manualEdited', 'materializationVersion', 'sectionPartIndexes', 'songs',
  'tonalProgression', 'transposeMode', 'unifiedKey',
].sort());
assert.deepEqual(Object.keys(songs[0].data.medleyConfig.songs[0]).sort(), [
  'materializedKey', 'medleyKey', 'originalKey', 'songId', 'title',
].sort());
assert.equal('equipo' in events[0].data, false);
assert.equal('projectorState' in events[0].data, false);
assert.equal('email' in events[0].data.setlist[0], false);
assert.equal(events[0].data.setlist.length, 1);
assert.deepEqual(events[0].data.setlist[0], {
  idLocal: 'projection-v2-1-synthetic-song-a', type: 'song', value: 'synthetic-song-a',
});
assert.equal('tonosAlternativos' in events[0].data.historicalSongSnapshots['historical-song'], false);
const serializedBackup = JSON.stringify(backup);
for (const excluded of [
  'Personal Name', 'person@example.invalid', 'nested@example.invalid', 'private-uid',
  'historical@example.invalid', 'historical-uid', 'Another Person', '555-0100',
]) assert.equal(serializedBackup.includes(excluded), false, `Excluded value leaked: ${excluded}`);

const duplicate = structuredClone(backup);
duplicate.collections.canciones.push(structuredClone(duplicate.collections.canciones[0]));
assert.equal(validateBackup(duplicate).ok, false);

const missingRelation = createBackup({ songs, events: [sanitizeEvent('bad-event', {
  setlist: [{ idLocal: 'missing', type: 'song', value: 'missing-song' }], canciones: ['missing-song'],
})], createdAt: '2026-01-01T00:00:00.000Z' });
assert.equal(validateBackup(missingRelation).errors.some((error) => error.includes('references missing song')), true);

const invalidStyleSongs = structuredClone(songs);
invalidStyleSongs[0].data.projectionStyle.preset = 'unknown';
const invalidStyle = createBackup({ songs: invalidStyleSongs, events, createdAt: '2026-01-01T00:00:00.000Z' });
assert.equal(validateBackup(invalidStyle).errors.some((error) => error.includes('preset is invalid')), true);

const tampered = structuredClone(backup);
tampered.collections.canciones[0].data.titulo = 'Tampered';
assert.equal(validateBackup(tampered).errors.some((error) => error.includes('sha256')), true);

const externalResource = createBackup({
  songs: [sanitizeSong('external-song', {
    titulo: 'External', letraRaw: '# Verso\n[C]Texto', medleyConfig: { unexpectedUrl: 'https://external.invalid/media' },
  })],
  events: [],
  createdAt: '2026-01-01T00:00:00.000Z',
});
assert.equal(JSON.stringify(externalResource).includes('external.invalid'), false);
assert.equal(validateBackup(externalResource).ok, true);

const manuallyInjectedExternal = structuredClone(backup);
manuallyInjectedExternal.collections.canciones[0].data.medleyConfig.songs[0].title = 'https://external.invalid/media';
const rebuiltExternal = createBackup({
  songs: manuallyInjectedExternal.collections.canciones,
  events: manuallyInjectedExternal.collections.eventos,
  createdAt: '2026-01-01T00:00:00.000Z',
});
assert.equal(validateBackup(rebuiltExternal).errors.some((error) => error.includes('external resource URL')), true);

const unknownField = structuredClone(backup);
unknownField.collections.canciones[0].data.medleyConfig.songs[0].unexpected = 'not allowed';
const rebuiltUnknownField = createBackup({
  songs: unknownField.collections.canciones,
  events: unknownField.collections.eventos,
  createdAt: '2026-01-01T00:00:00.000Z',
});
assert.equal(validateBackup(rebuiltUnknownField).errors.some((error) => error.includes('unexpected is not allowed')), true);

const temporaryDirectory = await mkdtemp(join(tmpdir(), 'kadosh-projection-v2-backup-'));
try {
  const backupPath = join(temporaryDirectory, 'synthetic-backup.json');
  await writeFile(backupPath, `${JSON.stringify(backup, null, 2)}\n`, 'utf8');
  const validatorResult = spawnSync(process.execPath, [
    resolve('scripts/validate-projection-v2-backup.mjs'), backupPath,
  ], { encoding: 'utf8', env: { PATH: process.env.PATH } });
  assert.equal(validatorResult.status, 0, validatorResult.stderr);
  assert.equal(JSON.parse(validatorResult.stdout).valid, true);

  const exportSource = await readFile(resolve('scripts/export-projection-v2-readonly.mjs'), 'utf8');
  assert.match(exportSource, /collection\('canciones'\)\.get\(\)/);
  assert.match(exportSource, /collection\('eventos'\)\.get\(\)/);
  assert.doesNotMatch(exportSource, /\.(?:set|update|create|add)\s*\(/);
  assert.doesNotMatch(exportSource, /(?:batch|bulkWriter|runTransaction)\s*\(/);
  assert.match(exportSource, /credential\.applicationDefault\(\)/);
  assert.match(exportSource, /adc\.type !== 'impersonated_service_account'/);
  assert.match(exportSource, /Output must be outside the workspace/);
  assert.match(exportSource, /Output must be outside OneDrive/);
  assert.doesNotMatch(exportSource, /access-token-file|credential\.cert\(/);

  const importSource = await readFile(resolve('scripts/import-projection-v2-demo.mjs'), 'utf8');
  assert.match(importSource, /args\.project !== DEMO_PROJECT_ID/);
  assert.match(importSource, /FIRESTORE_EMULATOR_HOST/);
  assert.match(importSource, /batch\.create\(/);
  assert.doesNotMatch(importSource, /batch\.set\(/);
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}

console.log('projection v2 backup offline tests: PASS');
