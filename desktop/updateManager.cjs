'use strict';

const { createRendererTrustPolicy } = require('./rendererTrust.cjs');

const UPDATE_STATE_CHANNEL = 'kadosh-updater:state';
const UPDATE_IPC_CHANNELS = {
  getVersion: 'kadosh-updater:get-version',
  getState: 'kadosh-updater:get-state',
  check: 'kadosh-updater:check',
  install: 'kadosh-updater:install'
};

const serializeError = (error) => ({
  message: error?.message || 'No se pudo comprobar actualizaciones.'
});

const createUpdateManager = ({
  app,
  ipcMain,
  getMainWindow,
  isDevelopment = !app.isPackaged,
  developmentServerUrl = process.env.ELECTRON_RENDERER_URL || 'http://127.0.0.1:5173',
  updaterFactory = () => require('electron-updater').autoUpdater
}) => {
  let updater = null;
  let initialized = false;
  let state = {
    status: 'idle',
    currentVersion: app.getVersion(),
    availableVersion: null,
    percent: null,
    message: ''
  };
  const { isTrustedRendererUrl } = createRendererTrustPolicy({ isDevelopment, developmentServerUrl });

  const publish = () => {
    const webContents = getMainWindow?.()?.webContents;
    if (webContents && !webContents.isDestroyed?.()) webContents.send(UPDATE_STATE_CHANNEL, state);
  };

  const setState = (next) => {
    state = { ...state, ...next };
    publish();
    return state;
  };

  const isTrustedSender = (event) => (
    event.sender === getMainWindow?.()?.webContents
    && isTrustedRendererUrl(event.sender?.getURL?.() || '')
  );
  const setError = (error) => {
    console.error('Kadosh updater error:', error);
    return setState({ status: 'error', percent: null, message: 'No se pudo comprobar actualizaciones.', error: serializeError(error) });
  };

  const checkForUpdates = async () => {
    if (!app.isPackaged || !updater) return { accepted: false, reason: 'not-packaged', state };
    setState({ status: 'checking', percent: null, message: 'Buscando actualizaciones.', error: null });
    try {
      await updater.checkForUpdates();
      return { accepted: true, state };
    } catch (error) {
      setError(error);
      return { accepted: false, reason: 'check-failed', state };
    }
  };

  const installUpdate = () => {
    if (!app.isPackaged || !updater || state.status !== 'downloaded') {
      return { accepted: false, reason: 'update-not-downloaded', state };
    }
    updater.quitAndInstall(false, true);
    return { accepted: true };
  };

  const registerIpc = () => {
    ipcMain.handle(UPDATE_IPC_CHANNELS.getVersion, (event) => isTrustedSender(event) ? state.currentVersion : null);
    ipcMain.handle(UPDATE_IPC_CHANNELS.getState, (event) => isTrustedSender(event) ? state : null);
    ipcMain.handle(UPDATE_IPC_CHANNELS.check, (event) => isTrustedSender(event) ? checkForUpdates() : { accepted: false, reason: 'untrusted-sender' });
    ipcMain.handle(UPDATE_IPC_CHANNELS.install, (event) => isTrustedSender(event) ? installUpdate() : { accepted: false, reason: 'untrusted-sender' });
  };

  const initialize = () => {
    if (initialized) return state;
    initialized = true;
    registerIpc();
    if (!app.isPackaged) return state;

    updater = updaterFactory();
    updater.autoDownload = true;
    updater.autoInstallOnAppQuit = false;
    updater.on('checking-for-update', () => setState({ status: 'checking', percent: null, message: 'Buscando actualizaciones.', error: null }));
    updater.on('update-available', (info) => setState({ status: 'available', availableVersion: info?.version || null, percent: 0, message: 'Nueva actualización disponible.', error: null }));
    updater.on('update-not-available', () => setState({ status: 'up-to-date', availableVersion: null, percent: null, message: 'Kadosh App está actualizado.', error: null }));
    updater.on('download-progress', (progress) => setState({ status: 'downloading', percent: Math.round(Math.max(0, Math.min(100, Number(progress?.percent) || 0))), message: 'Descargando actualización.', error: null }));
    updater.on('update-downloaded', (info) => setState({ status: 'downloaded', availableVersion: info?.version || state.availableVersion, percent: 100, message: 'Actualización lista para instalar.', error: null }));
    updater.on('error', setError);
    void checkForUpdates();
    return state;
  };

  return { initialize, getState: () => state, checkForUpdates, installUpdate };
};

module.exports = { UPDATE_STATE_CHANNEL, UPDATE_IPC_CHANNELS, createUpdateManager, serializeError };
