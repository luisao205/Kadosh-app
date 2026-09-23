import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  classifyOutputUrl,
  normalizeOutputDescriptor,
  outputKey,
  readOutputConfig,
  createOutputWindowManager
} = require('../desktop/outputWindowManager.cjs');
const { createRendererTrustPolicy } = require('../desktop/rendererTrust.cjs');

const primary = { id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: { x: 0, y: 0, width: 1920, height: 1040 }, scaleFactor: 1, rotation: 0, internal: true, label: 'Principal' };
const secondary = { id: 2, bounds: { x: 1920, y: 0, width: 1920, height: 1080 }, workArea: { x: 1920, y: 0, width: 1920, height: 1040 }, scaleFactor: 1, rotation: 0, internal: false, label: 'HDMI' };

class FakeWindow extends EventEmitter {
  constructor(options) {
    super();
    this.options = options;
    this.bounds = null;
    this.fullscreen = false;
    this.visible = false;
    this.minimized = false;
    this.destroyed = false;
    this.webContents = new EventEmitter();
    this.webContents.url = '';
    this.webContents.getURL = () => this.webContents.url;
  }
  setMenuBarVisibility() {}
  setFullScreen(value) { this.fullscreen = value; }
  isFullScreen() { return this.fullscreen; }
  setBounds(bounds) { this.bounds = bounds; }
  show() { this.visible = true; }
  focus() { this.focused = true; }
  isMinimized() { return this.minimized; }
  restore() { this.minimized = false; }
  isDestroyed() { return this.destroyed; }
  loadURL(url) { this.webContents.url = url; }
  close() { this.destroyed = true; this.emit('closed'); }
}

const createIpcMain = () => {
  const handlers = new Map();
  return { handlers, handle: (channel, handler) => handlers.set(channel, handler) };
};

assert.equal(outputKey({ type: 'projector', eventId: 'e1' }), 'projector:e1');
assert.equal(outputKey({ type: 'custom', eventId: 'e1', outputId: 'side' }), 'custom:e1:side');
const productionTrust = createRendererTrustPolicy({ isDevelopment: false, developmentServerUrl: 'http://127.0.0.1:5173' });
assert.equal(productionTrust.isTrustedRendererUrl('kadosh://app/proyector/e1'), true);
assert.equal(productionTrust.isTrustedRendererUrl('http://localhost:5173/proyector/e1'), false);
assert.equal(productionTrust.isTrustedRendererUrl('http://127.0.0.1:5173/proyector/e1'), false);
assert.equal(productionTrust.isTrustedRendererUrl('http://127.0.0.1:9999/proyector/e1'), false);
assert.equal(productionTrust.isTrustedRendererUrl('https://localhost:5173/proyector/e1'), false);
const developmentTrust = createRendererTrustPolicy({ isDevelopment: true, developmentServerUrl: 'http://127.0.0.1:5173' });
assert.equal(developmentTrust.isTrustedRendererUrl('http://127.0.0.1:5173/retorno/e1'), true);
assert.equal(developmentTrust.isTrustedRendererUrl('http://127.0.0.1:9999/retorno/e1'), false);
assert.equal(developmentTrust.isTrustedRendererUrl('http://localhost:5173/retorno/e1'), false);
assert.equal(developmentTrust.isTrustedRendererUrl('https://127.0.0.1:5173/retorno/e1'), false);
assert.deepEqual(classifyOutputUrl('kadosh://app/proyector/e1')?.key, 'projector:e1');
assert.deepEqual(classifyOutputUrl('http://127.0.0.1:5173/retorno/e1', developmentTrust.isTrustedRendererUrl)?.key, 'singers:e1');
assert.equal(classifyOutputUrl('http://localhost:5173/retorno-musicos/e1', developmentTrust.isTrustedRendererUrl), null);
assert.deepEqual(classifyOutputUrl('kadosh://app/predicador/e1')?.key, 'preacher:e1');
assert.deepEqual(classifyOutputUrl('kadosh://app/output/e1/side')?.key, 'custom:e1:side');
assert.deepEqual(classifyOutputUrl('kadosh://app/output/global/side')?.key, 'global:side');
assert.equal(classifyOutputUrl('https://api.whatsapp.com/send'), null);
assert.equal(normalizeOutputDescriptor({ type: 'custom', eventId: 'e1' }), null);
assert.equal(normalizeOutputDescriptor({ type: 'unknown', eventId: 'e1' }), null);

const directory = await mkdtemp(path.join(tmpdir(), 'kadosh-output-window-test-'));
try {
  const configPath = path.join(directory, 'desktop-output-config.json');
  assert.deepEqual(readOutputConfig(configPath), { assignments: {} });
  await writeFile(configPath, '{ invalid json', 'utf8');
  assert.deepEqual(readOutputConfig(configPath), { assignments: {} });

  const screen = new EventEmitter();
  let displays = [primary, secondary];
  screen.getAllDisplays = () => displays;
  screen.getPrimaryDisplay = () => primary;
  const ipcMain = createIpcMain();
  const mainWebContents = { sent: [], isDestroyed: () => false, send(channel, state) { this.sent.push({ channel, state }); }, getURL: () => 'kadosh://app/' };
  let mainWindowRef = { isDestroyed: () => false, webContents: mainWebContents };
  const windows = [];
  const BrowserWindow = class extends FakeWindow {
    constructor(options) { super(options); windows.push(this); }
  };
  const manager = createOutputWindowManager({
    app: { getPath: () => directory },
    BrowserWindow,
    screen,
    ipcMain,
    getMainWindow: () => mainWindowRef,
    isDevelopment: false,
    developmentServerUrl: 'http://127.0.0.1:5173',
    appOrigin: 'kadosh://app/',
    preloadPath: 'preload.cjs',
    iconPath: 'logo.ico',
    configPath
  });
  manager.initialize();
  assert.equal(ipcMain.handlers.has('kadosh-outputs:open'), true);
  assert.equal(manager.getDisplays()[1].primary, false);
  assert.equal(manager.getDisplays()[1].label, 'HDMI');
  assert.equal(await ipcMain.handlers.get('kadosh-outputs:get-state')({ sender: { getURL: () => 'https://example.com' } }), null);
  assert.deepEqual(await ipcMain.handlers.get('kadosh-outputs:open')({ sender: { getURL: () => 'https://example.com' } }, { type: 'projector', eventId: 'e1' }), { accepted: false, reason: 'untrusted-sender' });

  assert.equal(manager.setOutputDisplay({ type: 'projector', displayId: 2 }).accepted, true);
  assert.equal(existsSync(configPath), true);
  assert.equal(manager.openOutput({ type: 'projector', eventId: 'e1' }).accepted, true);
  assert.equal(windows.length, 1);
  assert.equal(mainWebContents.sent.length > 0, true);
  windows[0].emit('ready-to-show');
  assert.equal(windows[0].fullscreen, true);
  assert.deepEqual(windows[0].bounds, secondary.bounds);
  assert.equal(windows[0].options.webPreferences.contextIsolation, true);
  assert.equal(windows[0].options.webPreferences.nodeIntegration, false);
  assert.equal(windows[0].options.webPreferences.sandbox, true);
  const internalNavigation = { prevented: false, preventDefault() { this.prevented = true; } };
  windows[0].webContents.emit('will-navigate', internalNavigation, 'kadosh://app/retorno/e1');
  assert.equal(internalNavigation.prevented, false);
  const externalNavigation = { prevented: false, preventDefault() { this.prevented = true; } };
  windows[0].webContents.emit('will-navigate', externalNavigation, 'https://example.com');
  assert.equal(externalNavigation.prevented, true);
  const externalRedirect = { prevented: false, preventDefault() { this.prevented = true; } };
  windows[0].webContents.emit('will-redirect', externalRedirect, 'https://example.com');
  assert.equal(externalRedirect.prevented, true);
  assert.equal(manager.openOutput({ type: 'projector', eventId: 'e1' }).accepted, true);
  assert.equal(windows.length, 1);

  assert.equal(manager.setOutputFullscreen({ type: 'projector', eventId: 'e1', fullscreen: false }).accepted, true);
  assert.equal(windows[0].fullscreen, false);
  displays = [primary];
  screen.emit('display-removed', secondary);
  assert.equal(windows[0].fullscreen, false);
  assert.equal(windows[0].bounds.x < primary.bounds.width, true);
  assert.equal(manager.getOutputState().assignments.projector, 2);

  assert.equal(manager.openOutput({ type: 'singers', eventId: 'e1' }).accepted, true);
  windows[1].emit('ready-to-show');
  assert.equal(windows[1].fullscreen, false);
  assert.equal(manager.setOutputFullscreen({ type: 'singers', eventId: 'e1', fullscreen: true }).reason, 'no-assigned-display');
  assert.equal(manager.handleWindowOpen({ openerUrl: 'kadosh://app/', targetUrl: 'https://api.whatsapp.com/send' }), false);
  assert.equal(manager.handleWindowOpen({ openerUrl: 'https://example.com', targetUrl: 'kadosh://app/retorno-musicos/e1' }), false);
  assert.equal(manager.handleWindowOpen({ openerUrl: 'kadosh://app/', targetUrl: 'kadosh://app/retorno-musicos/e1' }), true);
  assert.equal(windows.length, 3);
  mainWindowRef = null;
  assert.doesNotThrow(() => manager.openOutput({ type: 'preacher', eventId: 'e1' }));
  const destroyedMainWindow = {
    isDestroyed: () => true,
    get webContents() { throw new Error('Object has been destroyed'); }
  };
  mainWindowRef = destroyedMainWindow;
  assert.doesNotThrow(() => manager.openOutput({ type: 'custom', eventId: 'e1', outputId: 'shutdown' }));
  assert.equal(manager.closeOutput({ type: 'projector', eventId: 'e1' }).accepted, true);
  assert.doesNotThrow(() => windows.find((window) => window.webContents.getURL().includes('/output/e1/shutdown')).close());
  assert.equal(manager.closeAllOutputs().accepted, true);
} finally {
  await rm(directory, { recursive: true, force: true });
}

console.log('electron output windows: OK');
