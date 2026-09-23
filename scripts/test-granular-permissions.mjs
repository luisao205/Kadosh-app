import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import {
  PERMISSIONS,
  ROLE_PERMISSION_DEFAULTS,
  getRoleDefaults,
  hasPermission,
  overrideCount,
  sanitizeOverrides
} from '../src/utils/permissions.js';

const require = createRequire(import.meta.url);
const { canEditChordsOnly, canEditLyricsOnly } = require('../functions/songContent.js');

const originalChordPro = '# Verso\n[C]Santo [G]Dios\n{comment: repetir}\n[Puente] Aleluya';
assert.equal(canEditChordsOnly(originalChordPro, '# Verso\n[D]Santo [A]Dios\n{comment: repetir}\n[Puente] Aleluya'), true, 'chords can change without lyrics');
assert.equal(canEditChordsOnly(originalChordPro, '# Verso\n[D]Santo [A]Rey\n{comment: repetir}\n[Puente] Aleluya'), false, 'chords cannot change lyrics');
assert.equal(canEditLyricsOnly(originalChordPro, '# Verso\n[C]Santo [G]Rey\n{comment: repetir}\n[Puente] Aleluya'), true, 'lyrics can change without chords');
assert.equal(canEditLyricsOnly(originalChordPro, '# Verso\n[D]Santo [A]Dios\n{comment: repetir}\n[Puente] Aleluya'), false, 'lyrics cannot change chords');

const multimedia = { uid: 'media', rol: 'multimedia' };
const musician = { uid: 'musician', rol: 'musico' };
const owner = { uid: 'owner', rol: 'dueño', permissionOverrides: { [PERMISSIONS.SONGS_DELETE]: false } };

assert.equal(hasPermission(owner, PERMISSIONS.TEAM_MANAGE_PERMISSIONS), true, 'owner always retains access');
assert.equal(hasPermission(owner, PERMISSIONS.SONGS_DELETE), true, 'owner override cannot remove access');
assert.equal(hasPermission(multimedia, PERMISSIONS.SONGS_EDIT_LYRICS), true, 'legacy multimedia default remains enabled');
assert.equal(hasPermission(musician, PERMISSIONS.SONGS_EDIT_CHORDS), false, 'musician inherits denied default');
assert.equal(hasPermission({ ...musician, permissionOverrides: { [PERMISSIONS.SONGS_EDIT_CHORDS]: true } }, PERMISSIONS.SONGS_EDIT_CHORDS), true, 'explicit allow wins');
assert.equal(hasPermission({ ...multimedia, permissionOverrides: { [PERMISSIONS.SONGS_EDIT_LYRICS]: false } }, PERMISSIONS.SONGS_EDIT_LYRICS), false, 'explicit deny wins');
assert.equal(hasPermission({ ...multimedia, permissionRoleDefaults: { multimedia: { [PERMISSIONS.SONGS_EDIT_LYRICS]: false } } }, PERMISSIONS.SONGS_EDIT_LYRICS), false, 'configured role default applies without override');
assert.equal(getRoleDefaults('multimedia', { multimedia: { [PERMISSIONS.SONGS_EDIT_LYRICS]: false } })[PERMISSIONS.SONGS_EDIT_LYRICS], false);
assert.equal(overrideCount({ permissionOverrides: { [PERMISSIONS.SONGS_EDIT_CHORDS]: true, invalid: true } }), 2);
assert.deepEqual(sanitizeOverrides({ [PERMISSIONS.SONGS_EDIT_CHORDS]: true, invalid: true }), { [PERMISSIONS.SONGS_EDIT_CHORDS]: true });
assert.equal(ROLE_PERMISSION_DEFAULTS.multimedia[PERMISSIONS.SETLISTS_ADD_SONG], true);

const [rules, functionsSource, teamSource, permissionPanel, announcementPermissions] = await Promise.all([
  readFile(new URL('../firestore.rules', import.meta.url), 'utf8'),
  readFile(new URL('../functions/index.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/admin/PermissionManagementPanel.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/admin/PermissionManagementPanel.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/utils/announcementPermissions.js', import.meta.url), 'utf8')
]);
assert.match(rules, /function hasPermissionOverride\(profile, permission\)/);
assert.match(rules, /function hasConfiguredRolePermission\(role, permission\)/);
assert.match(rules, /match \/sistema\/permissionRoles \{[\s\S]*allow write: if false/);
assert.match(rules, /permissionOverrides/);
assert.match(rules, /preservesOwnOwnerRole/);
assert.match(rules, /allow create: if hasPermission\('songs\.create'\)/);
assert.match(rules, /allow delete: if hasPermission\('songs\.delete'\) && resource\.data\.archived == true/);
assert.match(rules, /allow update: if isOwnerOnly\(\)/, 'direct non-owner song updates are blocked');
assert.match(rules, /hasProjectionPermissionForRequestedState/, 'projection permission is state scoped');
assert.match(rules, /state\.type == 'preaching'[\s\S]*state\.contentType == 'bible'[\s\S]*bible\.project/, 'Bible is scoped');
assert.match(rules, /function isExactBibleRestore\(\)[\s\S]*previousProjectionFields/, 'Bible may restore only its captured state');
assert.match(rules, /state\.type in \['media', 'lyrics'\][\s\S]*multimedia\.project/, 'media is scoped');
assert.match(rules, /announcements\.project/, 'announcements are scoped');
assert.match(rules, /allow delete: if isOwnerOnly\(\) && request\.auth\.uid != userId/, 'nobody can self-delete');
assert.match(rules, /match \/permissionAudit\/\{auditId\}/, 'audit uses documents');
assert.match(functionsSource, /hasLiveSetlistPermission/);
assert.match(functionsSource, /permissionRoles/);
assert.match(functionsSource, /assertLiveSetlistAccess\(context\.auth\.uid, "setlists\.addSong"\)/);
assert.match(functionsSource, /assertLiveSetlistAccess\(context\.auth\.uid, "setlists\.removeSong"\)/);
assert.match(functionsSource, /exports\.updateSongLyrics/);
assert.match(functionsSource, /exports\.updateSongChords/);
assert.match(functionsSource, /exports\.updateSongMetadata/);
assert.match(functionsSource, /canEditChordsOnly/);
assert.match(functionsSource, /canEditLyricsOnly/);
assert.match(teamSource, /Restaurar permisos del rol/);
assert.match(teamSource, /Usar permiso del rol/);
assert.doesNotMatch(permissionPanel, /arrayUnion\(/, 'permission audit must not use arrays');
assert.doesNotMatch(permissionPanel, /permissionAudit/, 'permission audit must be server-authoritative');
assert.match(permissionPanel, /updateUserPermissionOverrides/);
assert.match(announcementPermissions, /ANNOUNCEMENTS_PROJECT/);

console.log('granular permissions: OK');
