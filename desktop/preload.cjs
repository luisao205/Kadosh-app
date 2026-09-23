'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('kadoshDesktop', {
  updater: {
    getVersion: () => ipcRenderer.invoke('kadosh-updater:get-version'),
    getUpdateState: () => ipcRenderer.invoke('kadosh-updater:get-state'),
    checkForUpdates: () => ipcRenderer.invoke('kadosh-updater:check'),
    installUpdate: () => ipcRenderer.invoke('kadosh-updater:install'),
    onStateChange: (listener) => {
      if (typeof listener !== 'function') return () => {};
      const handler = (_event, state) => listener(state);
      ipcRenderer.on('kadosh-updater:state', handler);
      return () => ipcRenderer.removeListener('kadosh-updater:state', handler);
    }
  },
  outputs: {
    getDisplays: () => ipcRenderer.invoke('kadosh-outputs:get-displays'),
    getState: () => ipcRenderer.invoke('kadosh-outputs:get-state'),
    open: (output) => ipcRenderer.invoke('kadosh-outputs:open', output),
    focus: (output) => ipcRenderer.invoke('kadosh-outputs:focus', output),
    close: (output) => ipcRenderer.invoke('kadosh-outputs:close', output),
    setDisplay: (assignment) => ipcRenderer.invoke('kadosh-outputs:set-display', assignment),
    setFullscreen: (output) => ipcRenderer.invoke('kadosh-outputs:set-fullscreen', output),
    onStateChange: (listener) => {
      if (typeof listener !== 'function') return () => {};
      const handler = (_event, state) => listener(state);
      ipcRenderer.on('kadosh-outputs:state', handler);
      return () => ipcRenderer.removeListener('kadosh-outputs:state', handler);
    }
  }
});
