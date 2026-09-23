import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [userManagement, permissionPanel, permissions] = await Promise.all([
  readFile(new URL('../src/components/admin/UserManagement.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/admin/PermissionManagementPanel.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/utils/permissions.js', import.meta.url), 'utf8')
]);

assert.match(userManagement, /type="button" onClick=\{\(\) => setPermissionUser\(user\)\}/);
assert.doesNotMatch(userManagement, /setPermissionUser\(user\); window\.scrollTo/);
assert.match(userManagement, /\{permissionUser && \(/);
assert.match(userManagement, /fixed inset-0 z-\[80\]/);
assert.match(userManagement, /onClick=\{\(\) => setPermissionUser\(null\)\}/);
assert.match(userManagement, /onClick=\{\(event\) => event\.stopPropagation\(\)\}/);
assert.match(userManagement, /selectedUser=\{permissionUser\}/);
assert.match(userManagement, /<PermissionManagementPanel key=\{permissionUser\.id\}/);
assert.match(permissionPanel, /if \(!isOwnerUser\(currentUser\)\) return null;/);
assert.match(permissions, /normalizeRole\(user\?\.rol \|\| user\?\.role\) === 'dueno'/);

console.log('member permission panel selection and modal contract: OK');
