import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  APP_ORIGIN,
  resolveProductionRendererRequest
} = require('../desktop/productionRouting.cjs');

const fixtureDirectory = await mkdtemp(path.join(tmpdir(), 'kadosh-electron-routing-'));

try {
  await mkdir(path.join(fixtureDirectory, 'assets'));
  await writeFile(path.join(fixtureDirectory, 'index.html'), '<!doctype html><title>Kadosh</title>');
  await writeFile(path.join(fixtureDirectory, 'assets', 'app.js'), 'console.log("asset")');

  const htmlHeaders = { accept: 'text/html,application/xhtml+xml' };
  const root = resolveProductionRendererRequest(APP_ORIGIN, { distDirectory: fixtureDirectory, headers: htmlHeaders });
  assert.equal(root.kind, 'file');
  assert.equal(root.filePath, path.join(fixtureDirectory, 'index.html'));

  const asset = resolveProductionRendererRequest('kadosh://app/assets/app.js', { distDirectory: fixtureDirectory });
  assert.equal(asset.kind, 'file');
  assert.equal(asset.filePath, path.join(fixtureDirectory, 'assets', 'app.js'));

  const deepRoute = resolveProductionRendererRequest('kadosh://app/proyector/ABC', { distDirectory: fixtureDirectory, headers: htmlHeaders });
  assert.equal(deepRoute.kind, 'spa-fallback');
  assert.equal(deepRoute.filePath, path.join(fixtureDirectory, 'index.html'));

  const missingAsset = resolveProductionRendererRequest('kadosh://app/assets/missing.js', { distDirectory: fixtureDirectory, headers: htmlHeaders });
  assert.equal(missingAsset.kind, 'not-found');
  assert.equal(missingAsset.reason, 'missing-asset');

  const foreignOrigin = resolveProductionRendererRequest('kadosh://other/proyector/ABC', { distDirectory: fixtureDirectory, headers: htmlHeaders });
  assert.equal(foreignOrigin.kind, 'not-found');
  assert.equal(foreignOrigin.reason, 'invalid-origin');

  const traversal = resolveProductionRendererRequest('kadosh://app/%2e%2e/secret.txt', { distDirectory: fixtureDirectory, headers: htmlHeaders });
  assert.equal(traversal.kind, 'not-found');
  assert.equal(traversal.reason, 'path-traversal');

  const encodedTraversal = resolveProductionRendererRequest('kadosh://app/assets/%2e%2e%2fsecret.txt', { distDirectory: fixtureDirectory, headers: htmlHeaders });
  assert.equal(encodedTraversal.kind, 'not-found');
  assert.equal(encodedTraversal.reason, 'path-traversal');

  const navigationTraversal = resolveProductionRendererRequest('kadosh://app/../proyector/ABC', { distDirectory: fixtureDirectory, headers: htmlHeaders });
  assert.equal(navigationTraversal.kind, 'not-found');
  assert.equal(navigationTraversal.reason, 'path-traversal');

  const openedRoute = new URL('/proyector/ABC', APP_ORIGIN);
  assert.equal(openedRoute.href, 'kadosh://app/proyector/ABC');
} finally {
  await rm(fixtureDirectory, { recursive: true, force: true });
}

console.log('electron production routing: OK');
