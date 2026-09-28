import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const manifest = await readFile(new URL('../android/app/src/main/AndroidManifest.xml', import.meta.url), 'utf8');
const mainActivity = await readFile(new URL('../android/app/src/main/java/com/kadosh/app/MainActivity.java', import.meta.url), 'utf8');
const nativePlugin = await readFile(new URL('../android/app/src/main/java/com/kadosh/app/KadoshUpdatePlugin.java', import.meta.url), 'utf8');
const updateBridge = await readFile(new URL('../src/native/kadoshUpdate.js', import.meta.url), 'utf8');
const updateGate = await readFile(new URL('../src/components/updates/AndroidUpdateGate.jsx', import.meta.url), 'utf8');
const appUpdates = await readFile(new URL('../src/utils/appUpdates.js', import.meta.url), 'utf8');
const functionsMain = await readFile(new URL('../functions/main.js', import.meta.url), 'utf8');
const viteConfig = await readFile(new URL('../vite.config.js', import.meta.url), 'utf8');
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

assert.match(manifest, /android\.permission\.REQUEST_INSTALL_PACKAGES/);
assert.match(manifest, /androidx\.core\.content\.FileProvider/);
assert.match(mainActivity, /registerPlugin\(KadoshUpdatePlugin\.class\)/);
assert.match(nativePlugin, /@CapacitorPlugin\(name = "KadoshUpdate"\)/);
assert.match(nativePlugin, /canRequestPackageInstalls\(\)/);
assert.match(nativePlugin, /ACTION_MANAGE_UNKNOWN_APP_SOURCES/);
assert.match(nativePlugin, /FileProvider\.getUriForFile/);
assert.match(nativePlugin, /application\/vnd\.android\.package-archive/);
assert.match(updateBridge, /registerPlugin\('KadoshUpdate'\)/);
assert.match(updateGate, /installAndroidUpdate/);
assert.match(updateGate, /appStateChange/);
assert.match(updateGate, /Capacitor\.getPlatform\(\) === 'android'/);
assert.match(updateGate, /fetchPublishedAndroidUpdate/);
assert.match(updateGate, /PUBLIC_CHECK_INTERVAL_MS/);
assert.match(updateGate, /onAuthStateChanged\(getAuth\(\)/);
assert.match(appUpdates, /httpsCallable\(functions, 'getPublishedAndroidUpdate'\)/);
assert.match(appUpdates, /releases\/download/);
assert.match(appUpdates, /app-release\.apk/);
assert.match(functionsMain, /exports\.getPublishedAndroidUpdate = functions\.https\.onCall/);
assert.match(functionsMain, /sanitizePublishedAndroidConfig/);
assert.match(functionsMain, /exports\.notifyPublishedAndroidUpdate = functions\.firestore/);
assert.match(packageJson.scripts['build:android'], /--mode android/);
assert.match(viteConfig, /mode === 'android' \? \[\] : \[createPwaPlugin\(\)\]/);

console.log('android updater integration: OK');
