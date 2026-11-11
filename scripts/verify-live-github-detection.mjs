import assert from 'node:assert/strict';
import { isValidVersion, compareVersions } from '../src/utils/versioning.js';

console.log('=== VERIFYING LIVE GITHUB RELEASE DETECTION ===');

const response = await fetch('https://api.github.com/repos/luisao205/Kadosh-app/releases/latest', {
  headers: {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'Kadosh-Live-Verifier'
  }
});

assert.equal(response.status, 200, 'GitHub API must return 200');
const release = await response.json();

console.log('Latest release tag:', release.tag_name);
console.log('Latest release name:', release.name);
console.log('Assets count:', release.assets?.length);

const tagName = String(release.tag_name || '').trim();
const version = tagName.replace(/^v/i, '');
const assets = Array.isArray(release.assets) ? release.assets : [];
const androidAsset = assets.find((asset) => String(asset?.name || '').toLowerCase() === 'app-release.apk') || null;
const windowsAsset = assets.find((asset) => /^Kadosh-App-Setup-.+\.exe$/i.test(String(asset?.name || ''))) || null;
const ymlAsset = assets.find((asset) => asset.name === 'latest.yml') || null;

assert.equal(version, '1.1.12', 'Release version must be 1.1.12');
assert(androidAsset, 'Android asset app-release.apk must exist');
assert(windowsAsset, 'Windows asset Kadosh-App-Setup-1.1.12.exe must exist');
assert(ymlAsset, 'latest.yml asset must exist');

console.log('✓ Android APK URL:', androidAsset.browser_download_url);
console.log('✓ Windows EXE URL:', windowsAsset.browser_download_url);
console.log('✓ latest.yml URL:', ymlAsset.browser_download_url);

// Test downloading latest.yml directly from GitHub
const ymlRes = await fetch(ymlAsset.browser_download_url);
assert.equal(ymlRes.status, 200, 'latest.yml must be downloadable');
const ymlText = await ymlRes.text();
assert(ymlText.includes('version: 1.1.12'), 'Downloaded latest.yml must contain version: 1.1.12');
assert(ymlText.includes('Kadosh-App-Setup-1.1.12.exe'), 'Downloaded latest.yml must reference 1.1.12 installer');

console.log('✓ latest.yml verified and downloadable live from GitHub CDN');

// Version comparison check for 1.1.11 client
const isOlder = compareVersions('1.1.11', version) === -1;
assert.equal(isOlder, true, 'Client 1.1.11 must detect 1.1.12 as an upgrade');

console.log('=== ALL LIVE GITHUB RELEASE VERIFICATIONS PASSED ===');
