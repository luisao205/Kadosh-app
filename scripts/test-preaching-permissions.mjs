import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const preaching = await readFile(new URL('../src/components/admin/PreachingManagement.jsx', import.meta.url), 'utf8');
const permissions = await readFile(new URL('../src/utils/permissions.js', import.meta.url), 'utf8');
const permissionFunctions = await readFile(new URL('../functions/permissionManagement.js', import.meta.url), 'utf8');

assert.match(permissions, /SERMONS_CREATE_POINT: 'sermons\.createPoint'/);
assert.match(permissions, /SERMONS_CREATE_BIBLE_PASSAGE: 'sermons\.createBiblePassage'/);
assert.match(permissions, /Crear puntos en prédicas/);
assert.match(permissions, /Crear pasajes de Biblia en prédicas/);
assert.match(permissionFunctions, /'sermons\.createPoint'/);
assert.match(permissionFunctions, /'sermons\.createBiblePassage'/);
assert.match(preaching, /canCreatePointBlocks = hasPermission\(user, PERMISSIONS\.SERMONS_CREATE_POINT\)/);
assert.match(preaching, /canCreateBiblePassageBlocks = hasPermission\(user, PERMISSIONS\.SERMONS_CREATE_BIBLE_PASSAGE\)/);
assert.match(preaching, /Object\.entries\(BLOCK_TYPES\)\.filter\(\(\[type\]\) => canCreateBlockType\(type\)\)/);
assert.match(preaching, /Boolean\(biblePickerBlockId\) && canCreateBiblePassageBlocks/);
assert.match(preaching, /No tienes permiso para crear puntos en prédicas/);
assert.match(preaching, /No tienes permiso para crear pasajes de Biblia en prédicas/);

console.log('preaching block permissions: OK');
