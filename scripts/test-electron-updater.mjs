import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createUpdateManager, serializeError } = require('../desktop/updateManager.cjs');

class FakeUpdater extends EventEmitter {
  constructor() {
    super();
    this.checkCalls = 0;
    this.installCalls = [];
  }

  async checkForUpdates() {
    this.checkCalls += 1;
    return null;
  }

  quitAndInstall(...args) {
    this.installCalls.push(args);
  }
}

const createIpcMain = () => {
  const handlers = new Map();
  return { handlers, handle: (channel, handler) => handlers.set(channel, handler) };
};

const createWebContents = (url = 'kadosh://app/') => ({
  url,
  sent: [],
  send(channel, state) { this.sent.push({ channel, state }); },
  isDestroyed: () => false,
  getURL() { return this.url; }
});

const developmentIpc = createIpcMain();
const developmentUpdater = new FakeUpdater();
const developmentWebContents = createWebContents('http://127.0.0.1:5173/');
const developmentManager = createUpdateManager({
  app: { isPackaged: false, getVersion: () => '0.1.0' },
  ipcMain: developmentIpc,
  getMainWindow: () => ({ webContents: developmentWebContents }),
  updaterFactory: () => developmentUpdater
});
assert.equal(developmentManager.initialize().status, 'idle');
assert.equal(developmentUpdater.checkCalls, 0);

const ipcMain = createIpcMain();
const updater = new FakeUpdater();
const webContents = createWebContents();
const manager = createUpdateManager({
  app: { isPackaged: true, getVersion: () => '0.1.0' },
  ipcMain,
  getMainWindow: () => ({ webContents }),
  updaterFactory: () => updater
});

manager.initialize();
assert.equal(updater.autoDownload, true);
assert.equal(updater.autoInstallOnAppQuit, false);
assert.equal(updater.checkCalls, 1);
assert.equal(manager.getState().currentVersion, '0.1.0');
assert.equal(manager.installUpdate().accepted, false);

updater.emit('update-not-available');
assert.equal(manager.getState().status, 'up-to-date');
updater.emit('update-available', { version: '0.1.1' });
assert.equal(manager.getState().status, 'available');
assert.equal(manager.getState().availableVersion, '0.1.1');
updater.emit('download-progress', { percent: 63.4 });
assert.equal(manager.getState().status, 'downloading');
assert.equal(manager.getState().percent, 63);
updater.emit('update-downloaded', { version: '0.1.1' });
assert.equal(manager.getState().status, 'downloaded');
assert.deepEqual(manager.installUpdate(), { accepted: true });
assert.deepEqual(updater.installCalls, [[false, true]]);
const originalConsoleError = console.error;
console.error = () => {};
updater.emit('error', new Error('network details'));
console.error = originalConsoleError;
assert.equal(manager.getState().status, 'error');
assert.equal(manager.getState().message, 'No se pudo comprobar actualizaciones.');
assert.deepEqual(serializeError(new Error('private details')), { message: 'private details' });

const checkHandler = ipcMain.handlers.get('kadosh-updater:check');
assert.deepEqual(await checkHandler({ sender: {} }), { accepted: false, reason: 'untrusted-sender' });
assert.equal((await checkHandler({ sender: webContents })).accepted, true);
webContents.url = 'https://example.com';
assert.deepEqual(await checkHandler({ sender: webContents }), { accepted: false, reason: 'untrusted-sender' });

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const builderConfig = await readFile(new URL('../electron-builder.yml', import.meta.url), 'utf8');
const preloadSource = await readFile(new URL('../desktop/preload.cjs', import.meta.url), 'utf8');
const rendererSource = await readFile(new URL('../src/components/admin/DesktopUpdateStatus.jsx', import.meta.url), 'utf8');

assert.equal(packageJson.dependencies['electron-updater'], '6.8.9');
assert.match(builderConfig, /provider: github/);
assert.match(builderConfig, /owner: luisao205/);
assert.match(builderConfig, /repo: Kadosh-app/);
assert.match(preloadSource, /contextBridge\.exposeInMainWorld\('kadoshDesktop'/);
assert.match(preloadSource, /getVersion/);
assert.match(preloadSource, /getUpdateState/);
assert.match(preloadSource, /checkForUpdates/);
assert.match(preloadSource, /installUpdate/);
assert.doesNotMatch(preloadSource, /ipcRenderer:\s*ipcRenderer/);
assert.doesNotMatch(preloadSource, /send:\s*ipcRenderer\.send/);
assert.match(rendererSource, /window\.kadoshDesktop\?\.updater/);

console.log('electron updater contract: OK');
