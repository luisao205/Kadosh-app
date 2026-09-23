import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  ELECTRON_SCROLLBAR_CSS,
  attachNativeWindowBehavior,
  isInternalKadoshUrl
} = require('../desktop/nativeWindowBehavior.cjs');
const {
  initializeWindowsStartup
} = require('../desktop/windowsStartup.cjs');

const flushPromises = () => new Promise((resolve) => setImmediate(resolve));

const createWebContents = (url) => {
  const webContents = new EventEmitter();
  webContents.getURL = () => url;
  webContents.insertedCss = [];
  webContents.insertCSS = async (css) => webContents.insertedCss.push(css);
  return webContents;
};

const createInputEvent = () => ({
  prevented: false,
  preventDefault() {
    this.prevented = true;
  }
});

assert.equal(isInternalKadoshUrl('kadosh://app/proyector/evento'), true);
assert.equal(isInternalKadoshUrl('https://web.whatsapp.com'), false);
assert.doesNotMatch(ELECTRON_SCROLLBAR_CSS, /overflow\s*:\s*hidden/i);

const internalContents = createWebContents('kadosh://app/');
const window = {
  fullscreen: false,
  isFullScreen() { return this.fullscreen; },
  setFullScreen(value) { this.fullscreen = value; }
};
const BrowserWindow = { fromWebContents: () => window };
attachNativeWindowBehavior(internalContents, BrowserWindow);
internalContents.emit('did-finish-load');
await flushPromises();
assert.deepEqual(internalContents.insertedCss, [ELECTRON_SCROLLBAR_CSS]);

const f11Event = createInputEvent();
internalContents.emit('before-input-event', f11Event, { type: 'keyDown', key: 'F11', isAutoRepeat: false });
assert.equal(f11Event.prevented, true);
assert.equal(window.fullscreen, true);

const repeatedF11Event = createInputEvent();
internalContents.emit('before-input-event', repeatedF11Event, { type: 'keyDown', key: 'F11', isAutoRepeat: true });
assert.equal(repeatedF11Event.prevented, false);
assert.equal(window.fullscreen, true);

const escapeEvent = createInputEvent();
internalContents.emit('before-input-event', escapeEvent, { type: 'keyDown', key: 'Escape', isAutoRepeat: false });
assert.equal(escapeEvent.prevented, true);
assert.equal(window.fullscreen, false);

const normalEscapeEvent = createInputEvent();
internalContents.emit('before-input-event', normalEscapeEvent, { type: 'keyDown', key: 'Escape', isAutoRepeat: false });
assert.equal(normalEscapeEvent.prevented, false);

const externalContents = createWebContents('https://web.whatsapp.com');
attachNativeWindowBehavior(externalContents, BrowserWindow);
externalContents.emit('did-finish-load');
await flushPromises();
assert.equal(externalContents.insertedCss.length, 0);

const startupDirectory = await mkdtemp(path.join(tmpdir(), 'kadosh-windows-startup-'));
try {
  const markerPath = path.join(startupDirectory, 'startup.json');
  const startupCalls = [];
  const packagedWindowsApp = {
    isPackaged: true,
    setLoginItemSettings: (settings) => startupCalls.push(settings),
    getLoginItemSettings: () => ({ openAtLogin: true })
  };

  assert.equal(initializeWindowsStartup({ app: packagedWindowsApp, platform: 'win32', markerPath }), true);
  assert.deepEqual(startupCalls, [{ openAtLogin: true }]);
  assert.equal(existsSync(markerPath), true);
  assert.equal(initializeWindowsStartup({ app: packagedWindowsApp, platform: 'win32', markerPath }), false);
  assert.equal(startupCalls.length, 1);

  const unconfirmedMarkerPath = path.join(startupDirectory, 'unconfirmed.json');
  const unconfirmedCalls = [];
  const unconfirmedWindowsApp = {
    isPackaged: true,
    setLoginItemSettings: (settings) => unconfirmedCalls.push(settings),
    getLoginItemSettings: () => ({ openAtLogin: false })
  };
  assert.equal(initializeWindowsStartup({ app: unconfirmedWindowsApp, platform: 'win32', markerPath: unconfirmedMarkerPath }), false);
  assert.deepEqual(unconfirmedCalls, [{ openAtLogin: true }]);
  assert.equal(existsSync(unconfirmedMarkerPath), false);

  assert.equal(initializeWindowsStartup({ app: { isPackaged: false }, platform: 'win32', markerPath: path.join(startupDirectory, 'dev.json') }), false);
  assert.equal(initializeWindowsStartup({ app: { isPackaged: true }, platform: 'darwin', markerPath: path.join(startupDirectory, 'mac.json') }), false);
} finally {
  await rm(startupDirectory, { recursive: true, force: true });
}

console.log('electron native behavior: OK');
