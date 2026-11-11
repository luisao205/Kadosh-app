import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [editSong, editor, songList, client, emulatorLauncher, viteLauncher] = await Promise.all([
  read('src/components/admin/EditSong.jsx'),
  read('src/components/admin/LyricFormattingDraftEditor.jsx'),
  read('src/components/admin/SongList.jsx'),
  read('src/utils/v21CallableClient.js'),
  read('scripts/run-demo-e2e-emulators.mjs'),
  read('scripts/run-e2e-vite.mjs'),
]);

assert.match(client, /VITE_V21_CALLABLES_ENABLED === 'true'/);
assert.match(client, /VITE_E2E_SAFE === 'true'/);
assert.match(client, /VITE_USE_FIREBASE_EMULATORS === 'true'/);
assert.match(client, /VITE_PROJECT_ID === DEMO_PROJECT_ID/);
assert.match(client, /VITE_FIREBASE_EMULATOR_HOST === '127\.0\.0\.1'/);
assert.match(client, /httpsCallable\(functions, name\)\(payload\)/);
assert.match(client, /httpsCallable\(functions, 'getV21Capability'\)/);
assert.match(client, /onAuthStateChanged/);
assert.match(client, /detailCode === 'feature-disabled'/);
assert.doesNotMatch(client, /error\?\.code === 'functions\/failed-precondition'/);
assert.match(client, /publishCapability\(auth\.currentUser\?\.uid, DISABLED_CAPABILITY\)/);
assert.doesNotMatch(client, /setDoc|updateDoc|addDoc|writeBatch/);

assert.match(editSong, /classifyLyricFormattingSidecar/);
assert.match(editSong, /confirmedLyricFormatting/);
assert.match(editSong, /formattingRequestRef/);
assert.match(editSong, /saveInFlightRef\.current/);
assert.match(editSong, /editRevisionRef\.current !== operationRevision/);
assert.match(editSong, /if \(!active\) return/);
assert.match(editSong, /active = false/);
assert.match(editSong, /v21Capability\.canEditFormatting && <LyricFormattingDraftEditor/);
assert.doesNotMatch(editSong, /key=\{`\$\{id\}:\$\{lyricFormattingStatus\}`\}/);
assert.match(editSong, /metadataAllowsMediaSync/);
assert.match(editSong, /mediaUsagePending && metadataAllowsMediaSync/);
assert.match(editSong, /El guardado terminó, pero hay cambios nuevos pendientes/);
assert.doesNotMatch(editSong, /if \(stemsNuevosCount > 0\) \{\s*await addDoc/s);
assert.match(editSong, /requestIdFor/);
assert.match(editSong, /saveLyricsAndFormattingV21\(payload\)/);
assert.match(editSong, /saveLyricFormattingV21\(payload\)/);
assert.match(editSong, /validateV21SavePayloadSize\(\{/);
const preflightIndex = editSong.indexOf('validateV21SavePayloadSize({');
assert.ok(preflightIndex > 0 && preflightIndex < editSong.indexOf("saveLyricsAndFormattingV21(payload)", preflightIndex));
assert.ok(preflightIndex < editSong.indexOf("saveLyricFormattingV21(payload)", preflightIndex));
const preflightFailureBranch = editSong.slice(preflightIndex, editSong.indexOf('} else if (lyricsChanged)', preflightIndex));
assert.doesNotMatch(preflightFailureBranch, /setLyricFormattingDraft\(null\)|lyricFormattingDraftRef\.current\s*=\s*null/);
assert.match(editSong, /commitConfirmedPatch\(metadataChanges\)/);
assert.match(editSong, /Pendiente: \$\{pending\.join/);
assert.match(editSong, /return false;/);

assert.match(editor, /initialFormatting/);
assert.match(editor, /setDraftSidecar\(initialFormatting\)/);
assert.match(editor, /onDraftChange\?\.\(draftSidecar\)/);
assert.match(editor, /formato almacenado/i);
assert.match(editor, /pendiente de reconciliaci/);

const callableStart = songList.indexOf('if (v21Capability.canDuplicate)');
const callableBranch = songList.slice(callableStart, songList.indexOf('if (original.lyricFormatting', callableStart));
assert.match(callableBranch, /duplicateSongV21\(\{ songId: song\.id, requestId \}\)/);
assert.doesNotMatch(callableBranch, /original|copyData|writeBatch/);
assert.match(songList, /original\.lyricFormatting/);
assert.match(songList, /duplicateInFlightRef\.current/);
assert.match(songList, /solo esta disponible en el entorno de prueba seguro/);

assert.match(emulatorLauncher, /FIREBASE_EMULATORS_PATH/);
assert.doesNotMatch(emulatorLauncher, /KADOSH_V21_CALLABLES_ENABLED: 'true'/, 'General E2E emulators do not enable V2.1 callables.');
assert.doesNotMatch(viteLauncher, /VITE_V21_CALLABLES_ENABLED: 'true'/, 'General E2E Vite does not enable the V2.1 client.');

console.log('Projection V2.1-C3C.2 editor integration contract: PASS');
