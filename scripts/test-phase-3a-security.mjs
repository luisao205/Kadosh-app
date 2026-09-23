import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { canEditChordsOnly, canEditLyricsOnly } = require('../functions/songContent.js');

const original = '# Verso\n[C]Santo [G]Dios\n// x2 //\n//// Coro ////\n{cue: repetir}\n[Verso 1] Aleluya';
assert.equal(canEditChordsOnly(original, '# Verso\n[D]Santo [A]Dios\n// x2 //\n//// Coro ////\n{cue: repetir}\n[Verso 1] Aleluya'), true);
assert.equal(canEditLyricsOnly(original, '# Verso\n[C]Santo [G]Rey\n// x2 //\n//// Coro ////\n{cue: repetir}\n[Verso 1] Aleluya'), true);
assert.equal(canEditLyricsOnly(original, '# Verso\n[C]Santo [G]Rey\n// x3 //\n//// Coro ////\n{cue: repetir}\n[Verso 1] Aleluya'), false);
assert.equal(canEditChordsOnly(original, '# Verso\n[D]Santo [A]Dios\n// x3 //\n//// Coro ////\n{cue: repetir}\n[Verso 1] Aleluya'), false);

const [rules, functionsSource, panelSource] = await Promise.all([
  readFile(new URL('../firestore.rules', import.meta.url), 'utf8'),
  readFile(new URL('../functions/index.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/admin/PermissionManagementPanel.jsx', import.meta.url), 'utf8')
]);

assert.match(rules, /function sensitiveUserFields\(\)/);
assert.match(rules, /'ownership', 'owner', 'ownerUid', 'isOwner'/);
assert.match(rules, /allow delete: if hasPermission\('songs\.delete'\) && resource\.data\.archived == true/);
assert.match(rules, /match \/sistema\/permissionRoles \{[\s\S]*allow write: if false/);
assert.match(rules, /match \/permissionAudit\/\{auditId\} \{[\s\S]*allow read, write: if false/);
assert.match(rules, /validBibleProjectorState\(\)[\s\S]*proyectorMedia == null/);
assert.match(functionsSource, /exports\.updateUserPermissionOverrides/);
assert.match(functionsSource, /exports\.updateRolePermissionDefaults/);
assert.match(functionsSource, /transaction\.set\(auditRef/);
assert.match(functionsSource, /transaction\.update\(ref, \{ letraRaw/);
assert.match(functionsSource, /assertSongResource/);
assert.doesNotMatch(panelSource, /writeBatch\(|permissionAudit.*batch\.set/s);
assert.match(panelSource, /httpsCallable\(functions, 'updateRolePermissionDefaults'\)/);

console.log('phase 3a security unit checks: OK');
