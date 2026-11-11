import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { isValidVersion, compareVersions } from '../src/utils/versioning.js';

console.log('=== PRE-PUBLISH VALIDATION ===');

// 1. Files existence
const exePath = path.resolve('release/Kadosh-App-Setup-1.1.12.exe');
const ymlPath = path.resolve('release/latest.yml');
const apkPath = path.resolve('release/app-release.apk');
const blockmapPath = path.resolve('release/Kadosh-App-Setup-1.1.12.exe.blockmap');

assert(fs.existsSync(exePath), 'EXE file must exist');
assert(fs.existsSync(ymlPath), 'latest.yml must exist');
assert(fs.existsSync(apkPath), 'app-release.apk must exist');
assert(fs.existsSync(blockmapPath), 'blockmap must exist');

// 2. Hash check for latest.yml
const exeBuf = fs.readFileSync(exePath);
const calculatedSha512 = crypto.createHash('sha512').update(exeBuf).digest('base64');
const ymlContent = fs.readFileSync(ymlPath, 'utf8');

assert(ymlContent.includes('version: 1.1.12'), 'latest.yml must declare version 1.1.12');
assert(ymlContent.includes('Kadosh-App-Setup-1.1.12.exe'), 'latest.yml must point to Kadosh-App-Setup-1.1.12.exe');
assert(ymlContent.includes(calculatedSha512), 'latest.yml sha512 must match calculated EXE hash');
assert(ymlContent.includes(`size: ${exeBuf.length}`), 'latest.yml size must match EXE file size');

console.log('✓ Windows EXE sha512 & size matches latest.yml exactly');

// 3. Android APK check
const apkBuf = fs.readFileSync(apkPath);
assert(apkBuf.length > 20 * 1024 * 1024, 'APK must be valid size (>20MB)');
console.log(`✓ Android APK size: ${(apkBuf.length / (1024 * 1024)).toFixed(2)} MB`);

// 4. Update Decision logic simulation
const mockNewRelease = {
  tag_name: 'v1.1.12',
  assets: [
    { name: 'app-release.apk', browser_download_url: 'https://github.com/luisao205/Kadosh-app/releases/download/v1.1.12/app-release.apk', size: apkBuf.length },
    { name: 'Kadosh-App-Setup-1.1.12.exe', browser_download_url: 'https://github.com/luisao205/Kadosh-app/releases/download/v1.1.12/Kadosh-App-Setup-1.1.12.exe', size: exeBuf.length },
    { name: 'latest.yml', browser_download_url: 'https://github.com/luisao205/Kadosh-app/releases/download/v1.1.12/latest.yml', size: fs.statSync(ymlPath).size }
  ]
};

const tagName = String(mockNewRelease.tag_name || '').trim();
const version = tagName.replace(/^v/i, '');
const androidAsset = mockNewRelease.assets.find((asset) => String(asset?.name || '').toLowerCase() === 'app-release.apk');
const windowsAsset = mockNewRelease.assets.find((asset) => /^Kadosh-App-Setup-.+\.exe$/i.test(String(asset?.name || '')));

assert.equal(version, '1.1.12');
assert(androidAsset, 'Android asset must be detected');
assert(windowsAsset, 'Windows asset must be detected');

// Version comparison
assert.equal(compareVersions('1.1.11', '1.1.12'), -1, '1.1.11 must be older than 1.1.12');
assert.equal(compareVersions('1.1.12', '1.1.12'), 0, '1.1.12 must equal 1.1.12');

console.log('✓ Update decision comparison logic passes');
console.log('=== ALL PRE-PUBLISH CHECKS PASSED ===');
