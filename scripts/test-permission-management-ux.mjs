import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GROUP_PERMISSION_PRESETS, MULTIMEDIA_COMPLETE_PRESET, MULTIMEDIA_SUPPORT_PRESET } from '../src/utils/permissionPresets.js';
import { PERMISSIONS, ROLE_PERMISSION_DEFAULTS, getRoleDefaults, hasPermission } from '../src/utils/permissions.js';

const allPermissions = Object.values(PERMISSIONS);
assert.deepEqual(Object.keys(MULTIMEDIA_COMPLETE_PRESET).sort(), [...allPermissions].sort(), 'complete multimedia preset explicitly resolves every catalog permission');
[
  PERMISSIONS.DASHBOARD_VIEW, PERMISSIONS.EVENTS_VIEW, PERMISSIONS.SETLISTS_VIEW,
  PERMISSIONS.SETLISTS_ADD_SONG, PERMISSIONS.SETLISTS_REMOVE_SONG, PERMISSIONS.SETLISTS_REORDER,
  PERMISSIONS.SETLISTS_CONTROL, PERMISSIONS.SONGS_CREATE, PERMISSIONS.SONGS_EDIT_LYRICS,
  PERMISSIONS.SONGS_EDIT_CHORDS, PERMISSIONS.SONGS_EDIT_METADATA, PERMISSIONS.SONGS_MANAGE_MEDIA,
  PERMISSIONS.BIBLE_PROJECT, PERMISSIONS.BIBLE_QUICK_PROJECTION, PERMISSIONS.SERMONS_PROJECT,
  PERMISSIONS.MULTIMEDIA_PROJECT, PERMISSIONS.ANNOUNCEMENTS_PROJECT, PERMISSIONS.PROFILE_EDIT_OWN
].forEach((permission) => assert.equal(MULTIMEDIA_COMPLETE_PRESET[permission], true, `${permission} is included in multimedia complete`));
[
  PERMISSIONS.EVENTS_CREATE, PERMISSIONS.EVENTS_EDIT, PERMISSIONS.EVENTS_DELETE, PERMISSIONS.SETLISTS_MANAGE,
  PERMISSIONS.SONGS_DELETE, PERMISSIONS.MULTIMEDIA_DELETE, PERMISSIONS.ANNOUNCEMENTS_DELETE,
  PERMISSIONS.TEAM_EDIT, PERMISSIONS.TEAM_MANAGE_ROLES, PERMISSIONS.TEAM_MANAGE_PERMISSIONS
].forEach((permission) => assert.equal(MULTIMEDIA_COMPLETE_PRESET[permission], false, `${permission} remains excluded from multimedia complete`));

assert.deepEqual(MULTIMEDIA_SUPPORT_PRESET, {
  [PERMISSIONS.EVENTS_VIEW]: true,
  [PERMISSIONS.SETLISTS_VIEW]: true,
  [PERMISSIONS.SETLISTS_ADD_SONG]: true,
  [PERMISSIONS.BIBLE_VIEW]: true,
  [PERMISSIONS.BIBLE_PROJECT]: true,
  [PERMISSIONS.BIBLE_QUICK_PROJECTION]: true,
  [PERMISSIONS.MULTIMEDIA_CENTRAL_ACCESS]: true,
  [PERMISSIONS.MULTIMEDIA_PROJECT]: true,
  [PERMISSIONS.ANNOUNCEMENTS_VIEW]: true,
  [PERMISSIONS.ANNOUNCEMENTS_PROJECT]: true
});
assert.equal(GROUP_PERMISSION_PRESETS.multimediaComplete, MULTIMEDIA_COMPLETE_PRESET);
assert.equal(GROUP_PERMISSION_PRESETS.multimediaSupport, MULTIMEDIA_SUPPORT_PRESET);

const musician = { rol: 'musico' };
assert.equal(hasPermission(musician, PERMISSIONS.BIBLE_PROJECT), false, 'member inherits the role result');
assert.equal(hasPermission({ ...musician, permissionOverrides: { [PERMISSIONS.BIBLE_PROJECT]: true } }, PERMISSIONS.BIBLE_PROJECT), true, 'explicit allow overrides role');
assert.equal(hasPermission({ rol: 'multimedia', permissionOverrides: { [PERMISSIONS.SONGS_CREATE]: false } }, PERMISSIONS.SONGS_CREATE), false, 'explicit deny overrides role');
assert.equal(getRoleDefaults('multimedia')[PERMISSIONS.SETLISTS_MANAGE], ROLE_PERMISSION_DEFAULTS.multimedia[PERMISSIONS.SETLISTS_MANAGE]);

const [panel, functionsSource] = await Promise.all([
  readFile(new URL('../src/components/admin/PermissionManagementPanel.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../functions/index.js', import.meta.url), 'utf8')
]);
assert.match(panel, /Integrantes/);
assert.match(panel, /Edicion en grupo/);
assert.match(panel, /Usar permiso del rol/);
assert.match(panel, /Acceso total\. El Dueno no admite excepciones individuales/);
assert.match(panel, /usuarios\.filter\(\(member\) => !isOwnerUser\(member\)\)/);
assert.match(panel, /bulkUpdateUserPermissionOverrides/);
assert.match(panel, /Quitar todas las excepciones/);
assert.match(panel, /MULTIMEDIA_COMPLETE_PRESET/);
assert.match(functionsSource, /exports\.bulkUpdateUserPermissionOverrides/);
assert.match(functionsSource, /assertExactPayload\(data, \["userIds", "changes"\]\)/);
assert.match(functionsSource, /enabled !== null && typeof enabled !== "boolean"/);
assert.match(functionsSource, /value\.length > 50/);
assert.match(functionsSource, /normalizeRoleKey\(targetSnap\.get\("rol"\)\) === "dueno"/);
assert.match(functionsSource, /const nextOverrides = \{ \.\.\.previousOverrides \}/);
assert.match(functionsSource, /if \(value === null\) delete nextOverrides\[permission\]/);
assert.match(functionsSource, /action: "bulk-overrides"/);
assert.match(functionsSource, /timestamp: admin\.firestore\.FieldValue\.serverTimestamp\(\)/);

console.log('permission management UX and bulk contract: OK');
