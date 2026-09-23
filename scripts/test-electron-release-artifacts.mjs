import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const builderConfig = await readFile(new URL('../electron-builder.yml', import.meta.url), 'utf8');
const expectedInstaller = `Kadosh-App-Setup-${packageJson.version}.exe`;

assert.match(builderConfig, /artifactName: Kadosh-App-Setup-\$\{version\}\.\$\{ext\}/);

const artifactDirectory = process.env.KADOSH_RELEASE_DIR;
if (!artifactDirectory) {
  console.log('electron release artifacts: configuration OK (artifact directory not provided)');
  process.exit(0);
}

const installerPath = path.join(artifactDirectory, expectedInstaller);
const blockmapPath = `${installerPath}.blockmap`;
const latestPath = path.join(artifactDirectory, 'latest.yml');

assert.ok(existsSync(installerPath), `Missing installer: ${installerPath}`);
assert.ok(existsSync(blockmapPath), `Missing blockmap: ${blockmapPath}`);
assert.ok(existsSync(latestPath), `Missing latest.yml: ${latestPath}`);

const latest = await readFile(latestPath, 'utf8');
const version = latest.match(/^version:\s*(.+)$/m)?.[1]?.trim();
const file = latest.match(/^\s*- url:\s*(.+)$/m)?.[1]?.trim();
const hash = latest.match(/^\s+sha512:\s*(.+)$/m)?.[1]?.trim();
const size = Number(latest.match(/^\s+size:\s*(\d+)$/m)?.[1]);
const topLevelPath = latest.match(/^path:\s*(.+)$/m)?.[1]?.trim();

assert.equal(version, packageJson.version);
assert.equal(file, expectedInstaller);
assert.equal(topLevelPath, expectedInstaller);
assert.equal(path.basename(installerPath), file);
assert.ok(hash, 'latest.yml must include sha512');
assert.ok(Number.isSafeInteger(size) && size > 0, 'latest.yml must include a positive size');

const installer = await readFile(installerPath);
assert.equal(installer.length, size);
assert.equal(createHash('sha512').update(installer).digest('base64'), hash);
assert.ok(readdirSync(artifactDirectory).includes(path.basename(blockmapPath)));
const blockmap = JSON.parse(gunzipSync(await readFile(blockmapPath)).toString('utf8'));
assert.ok(Array.isArray(blockmap.files) && blockmap.files.length > 0, 'Blockmap must describe the installer');

console.log('electron release artifacts: OK');
