'use strict';

const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { app, BrowserWindow, Menu, ipcMain, net, protocol, screen } = require('electron');
const {
  APP_ORIGIN,
  APP_SCHEME,
  resolveProductionRendererRequest
} = require('./productionRouting.cjs');
const { attachNativeWindowBehavior } = require('./nativeWindowBehavior.cjs');
const { initializeWindowsStartup } = require('./windowsStartup.cjs');
const { createUpdateManager } = require('./updateManager.cjs');
const { createOutputWindowManager } = require('./outputWindowManager.cjs');

protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      allowServiceWorkers: true,
      stream: true
    }
  }
]);

const isDevelopment = !app.isPackaged;
const developmentServerUrl = process.env.ELECTRON_RENDERER_URL || 'http://127.0.0.1:5173';
let mainWindow = null;
let outputWindowManager = null;

const getIconPath = () => (
  app.isPackaged
    ? path.join(process.resourcesPath, 'logo.ico')
    : path.join(__dirname, '..', 'public', 'logo.ico')
);

const registerRendererProtocol = () => {
  protocol.handle(APP_SCHEME, async (request) => {
    const result = resolveProductionRendererRequest(request.url, {
      headers: request.headers
    });

    if (result.kind === 'not-found') {
      return new Response('Not found', { status: 404 });
    }

    return net.fetch(pathToFileURL(result.filePath).toString());
  });
};

const createMainWindow = () => {
  Menu.setApplicationMenu(null);

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 720,
    show: false,
    icon: getIconPath(),
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs')
    }
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.once('ready-to-show', () => mainWindow.show());

  if (isDevelopment) {
    mainWindow.loadURL(developmentServerUrl);
  } else {
    mainWindow.loadURL(APP_ORIGIN);
  }

  return mainWindow;
};

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  registerRendererProtocol();
  initializeWindowsStartup({ app });
  app.on('web-contents-created', (_event, webContents) => {
    attachNativeWindowBehavior(webContents, BrowserWindow);
    webContents.setWindowOpenHandler(({ url }) => {
      if (outputWindowManager?.handleWindowOpen({ openerUrl: webContents.getURL(), targetUrl: url })) return { action: 'deny' };
      return { action: 'allow' };
    });
  });
  outputWindowManager = createOutputWindowManager({
    app,
    BrowserWindow,
    screen,
    ipcMain,
    getMainWindow: () => mainWindow,
    isDevelopment,
    developmentServerUrl,
    appOrigin: APP_ORIGIN,
    preloadPath: path.join(__dirname, 'preload.cjs'),
    iconPath: getIconPath()
  });
  outputWindowManager.initialize();
  createMainWindow();
  createUpdateManager({
    app,
    ipcMain,
    getMainWindow: () => mainWindow,
    isDevelopment,
    developmentServerUrl
  }).initialize();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
