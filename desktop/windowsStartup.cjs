'use strict';

const fs = require('node:fs');
const path = require('node:path');

const STARTUP_MARKER_FILE = 'windows-startup-initialized.json';

const getStartupMarkerPath = (app) => path.join(app.getPath('userData'), STARTUP_MARKER_FILE);

const initializeWindowsStartup = ({ app, platform = process.platform, markerPath = getStartupMarkerPath(app) }) => {
  if (platform !== 'win32' || !app.isPackaged || fs.existsSync(markerPath)) return false;

  app.setLoginItemSettings({ openAtLogin: true });
  if (!app.getLoginItemSettings().openAtLogin) {
    console.warn('Windows no confirmó el inicio automático de Kadosh. Se reintentará en el próximo arranque.');
    return false;
  }

  fs.mkdirSync(path.dirname(markerPath), { recursive: true });
  fs.writeFileSync(markerPath, JSON.stringify({ initializedAt: new Date().toISOString() }), { flag: 'wx' });
  return true;
};

module.exports = {
  STARTUP_MARKER_FILE,
  getStartupMarkerPath,
  initializeWindowsStartup
};
