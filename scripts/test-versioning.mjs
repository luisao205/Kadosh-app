import assert from 'node:assert/strict';
import { compareVersions, isValidVersion, isVersionGreater, isVersionLower } from '../src/utils/versioning.js';

assert.equal(compareVersions('1.10.0', '1.9.9'), 1);
assert.equal(compareVersions('1.1.2', '1.1.1'), 1);
assert.equal(compareVersions('1.1.1', '1.1.1'), 0);
assert.equal(compareVersions('1.1.0', '1.1.1'), -1);
assert.equal(compareVersions('v2.0.0', '1.99.99'), 1);
assert.equal(compareVersions('1.2.0-beta.2', '1.2.0-beta.10'), -1);
assert.equal(compareVersions('1.2.0-beta.10', '1.2.0'), -1);
assert.equal(isVersionGreater('1.10.0', '1.9.9'), true);
assert.equal(isVersionLower('1.0.0', '1.0.1'), true);
assert.equal(isValidVersion('1.2.3'), true);
assert.equal(isValidVersion('version 1'), false);
assert.equal(compareVersions('invalid', '1.0.0'), null);

console.log('semantic versioning: OK');
