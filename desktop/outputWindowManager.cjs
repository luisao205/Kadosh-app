'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createRendererTrustPolicy, isKadoshAppUrl } = require('./rendererTrust.cjs');

const OUTPUT_STATE_CHANNEL = 'kadosh-outputs:state';
const OUTPUT_IPC_CHANNELS = {
  getDisplays: 'kadosh-outputs:get-displays',
  getState: 'kadosh-outputs:get-state',
  open: 'kadosh-outputs:open',
  focus: 'kadosh-outputs:focus',
  close: 'kadosh-outputs:close',
  setDisplay: 'kadosh-outputs:set-display',
  setFullscreen: 'kadosh-outputs:set-fullscreen'
};

const OUTPUT_TYPES = new Set(['projector', 'singers', 'musicians', 'preacher', 'custom', 'global']);
const DISPLAY_ASSIGNMENT_TYPES = new Set(['projector', 'singers', 'musicians', 'preacher', 'custom', 'global']);

const isInternalKadoshUrl = isKadoshAppUrl;

const outputKey = ({ type, eventId, outputId }) => {
  if (type === 'custom') return `custom:${eventId}:${outputId}`;
  if (type === 'global') return `global:${outputId}`;
  return `${type}:${eventId}`;
};

const getOutputRoute = ({ type, eventId, outputId }) => {
  if (type === 'global') return `/output/global/${encodeURIComponent(outputId)}`;
  const safeEventId = encodeURIComponent(eventId);
  if (type === 'projector') return `/proyector/${safeEventId}`;
  if (type === 'singers') return `/retorno/${safeEventId}`;
  if (type === 'musicians') return `/retorno-musicos/${safeEventId}`;
  if (type === 'preacher') return `/predicador/${safeEventId}`;
  return `/output/${safeEventId}/${encodeURIComponent(outputId)}`;
};

const normalizeOutputDescriptor = (payload) => {
  if (!payload || typeof payload !== 'object') return null;
  const type = typeof payload.type === 'string' ? payload.type : '';
  const eventId = typeof payload.eventId === 'string' ? payload.eventId.trim() : '';
  const outputId = typeof payload.outputId === 'string' ? payload.outputId.trim() : '';
  if (!OUTPUT_TYPES.has(type) || ((type !== 'global' && !eventId) || ((type === 'custom' || type === 'global') && !outputId))) return null;
  const descriptor = { type };
  if (type !== 'global') descriptor.eventId = eventId;
  if (type === 'custom' || type === 'global') descriptor.outputId = outputId;
  descriptor.key = outputKey(descriptor);
  descriptor.route = getOutputRoute(descriptor);
  return descriptor;
};

const classifyOutputUrl = (url, isTrustedRendererUrl = isKadoshAppUrl) => {
  if (!isTrustedRendererUrl(url)) return null;
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(url).pathname);
  } catch {
    return null;
  }
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length === 2 && parts[0] === 'proyector') return normalizeOutputDescriptor({ type: 'projector', eventId: parts[1] });
  if (parts.length === 2 && parts[0] === 'retorno') return normalizeOutputDescriptor({ type: 'singers', eventId: parts[1] });
  if (parts.length === 2 && parts[0] === 'retorno-musicos') return normalizeOutputDescriptor({ type: 'musicians', eventId: parts[1] });
  if (parts.length === 2 && parts[0] === 'predicador') return normalizeOutputDescriptor({ type: 'preacher', eventId: parts[1] });
  if (parts.length === 3 && parts[0] === 'output' && parts[1] === 'global') return normalizeOutputDescriptor({ type: 'global', outputId: parts[2] });
  if (parts.length === 3 && parts[0] === 'output') return normalizeOutputDescriptor({ type: 'custom', eventId: parts[1], outputId: parts[2] });
  return null;
};

const serializeDisplay = (display, primaryDisplay, index) => ({
  id: display.id,
  bounds: { ...display.bounds },
  workArea: { ...display.workArea },
  scaleFactor: display.scaleFactor,
  rotation: display.rotation ?? null,
  internal: typeof display.internal === 'boolean' ? display.internal : null,
  primary: display.id === primaryDisplay?.id,
  label: typeof display.label === 'string' && display.label.trim() ? display.label : `Pantalla ${index + 1}`
});

const readOutputConfig = (configPath, fileSystem = fs) => {
  try {
    if (!fileSystem.existsSync(configPath)) return { assignments: {} };
    const parsed = JSON.parse(fileSystem.readFileSync(configPath, 'utf8'));
    return parsed && typeof parsed.assignments === 'object' && !Array.isArray(parsed.assignments)
      ? { assignments: { ...parsed.assignments } }
      : { assignments: {} };
  } catch (error) {
    console.warn('Kadosh output configuration could not be read:', error.message);
    return { assignments: {} };
  }
};

const writeOutputConfig = (configPath, config, fileSystem = fs) => {
  const directory = path.dirname(configPath);
  const temporaryPath = `${configPath}.tmp`;
  fileSystem.mkdirSync(directory, { recursive: true });
  fileSystem.writeFileSync(temporaryPath, `${JSON.stringify({ version: 1, assignments: config.assignments }, null, 2)}\n`, 'utf8');
  fileSystem.renameSync(temporaryPath, configPath);
};

const createOutputWindowManager = ({
  app,
  BrowserWindow,
  screen,
  ipcMain,
  getMainWindow,
  isDevelopment,
  developmentServerUrl,
  appOrigin,
  preloadPath,
  iconPath,
  fileSystem = fs,
  configPath = path.join(app.getPath('userData'), 'desktop-output-config.json')
}) => {
  const windows = new Map();
  let config = readOutputConfig(configPath, fileSystem);
  let initialized = false;
  const { isTrustedRendererUrl } = createRendererTrustPolicy({ isDevelopment, developmentServerUrl });

  const getDisplays = () => {
    const primaryDisplay = screen.getPrimaryDisplay();
    return screen.getAllDisplays().map((display, index) => serializeDisplay(display, primaryDisplay, index));
  };

  const getDisplay = (displayId) => screen.getAllDisplays().find((display) => String(display.id) === String(displayId)) || null;
  const getAssignment = (type) => config.assignments[type] ?? null;

  const getOutputState = () => ({
    outputs: [...windows.values()]
      .filter(({ window }) => !window.isDestroyed?.())
      .map(({ descriptor, window }) => ({
        key: descriptor.key,
        type: descriptor.type,
        eventId: descriptor.eventId,
        outputId: descriptor.outputId || null,
        route: descriptor.route,
        open: true,
        minimized: window.isMinimized?.() || false,
        fullscreen: window.isFullScreen?.() || false,
        displayId: getAssignment(descriptor.type),
        displayAvailable: Boolean(getDisplay(getAssignment(descriptor.type)))
      })),
    assignments: { ...config.assignments }
  });

  const publishState = () => {
    const mainWindow = getMainWindow?.();
    if (!mainWindow || mainWindow.isDestroyed?.()) return;
    const mainContents = mainWindow.webContents;
    if (mainContents && !mainContents.isDestroyed?.()) mainContents.send(OUTPUT_STATE_CHANNEL, getOutputState());
  };

  const saveConfig = () => {
    try {
      writeOutputConfig(configPath, config, fileSystem);
      return true;
    } catch (error) {
      console.warn('Kadosh output configuration could not be saved:', error.message);
      return false;
    }
  };

  const rendererUrlFor = (descriptor) => {
    if (isDevelopment) return new URL(descriptor.route, developmentServerUrl).toString();
    return new URL(descriptor.route, appOrigin).toString();
  };

  const applyNormalBounds = (window) => {
    const primary = screen.getPrimaryDisplay();
    const workArea = primary.workArea || primary.bounds;
    const width = Math.min(1280, Math.max(800, workArea.width - 80));
    const height = Math.min(800, Math.max(600, workArea.height - 80));
    window.setFullScreen(false);
    window.setBounds({
      x: Math.round(workArea.x + ((workArea.width - width) / 2)),
      y: Math.round(workArea.y + ((workArea.height - height) / 2)),
      width,
      height
    });
  };

  const applyDisplayPlacement = (window, type) => {
    const display = getDisplay(getAssignment(type));
    if (!display) {
      applyNormalBounds(window);
      return false;
    }
    window.setFullScreen(false);
    window.setBounds({ ...display.bounds });
    window.setFullScreen(true);
    return true;
  };

  const focusOutput = (payload) => {
    const descriptor = normalizeOutputDescriptor(payload);
    if (!descriptor) return { accepted: false, reason: 'invalid-output' };
    const entry = windows.get(descriptor.key);
    if (!entry || entry.window.isDestroyed?.()) return { accepted: false, reason: 'not-open', state: getOutputState() };
    if (entry.window.isMinimized?.()) entry.window.restore();
    entry.window.show();
    entry.window.focus();
    return { accepted: true, state: getOutputState() };
  };

  const openOutput = (payload) => {
    const descriptor = normalizeOutputDescriptor(payload);
    if (!descriptor) return { accepted: false, reason: 'invalid-output' };
    const existing = windows.get(descriptor.key);
    const targetUrl = rendererUrlFor(descriptor);
    if (existing && !existing.window.isDestroyed?.()) {
      if (existing.window.webContents.getURL?.() !== targetUrl) existing.window.loadURL(targetUrl);
      return focusOutput(descriptor);
    }

    const window = new BrowserWindow({
      width: 1280,
      height: 720,
      minWidth: 800,
      minHeight: 600,
      show: false,
      icon: iconPath,
      autoHideMenuBar: true,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        preload: preloadPath
      }
    });
    window.setMenuBarVisibility(false);
    const blockExternalNavigation = (event, url) => {
      if (!isTrustedRendererUrl(url)) event.preventDefault();
    };
    window.webContents.on('will-navigate', blockExternalNavigation);
    window.webContents.on('will-redirect', blockExternalNavigation);
    windows.set(descriptor.key, { descriptor, window });
    window.once('ready-to-show', () => {
      applyDisplayPlacement(window, descriptor.type);
      window.show();
      publishState();
    });
    window.on('closed', () => {
      windows.delete(descriptor.key);
      publishState();
    });
    window.loadURL(targetUrl);
    publishState();
    return { accepted: true, state: getOutputState() };
  };

  const closeOutput = (payload) => {
    const descriptor = normalizeOutputDescriptor(payload);
    if (!descriptor) return { accepted: false, reason: 'invalid-output' };
    const entry = windows.get(descriptor.key);
    if (!entry || entry.window.isDestroyed?.()) return { accepted: false, reason: 'not-open', state: getOutputState() };
    entry.window.close();
    return { accepted: true, state: getOutputState() };
  };

  const closeAllOutputs = () => {
    [...windows.values()].forEach(({ window }) => {
      if (!window.isDestroyed?.()) window.close();
    });
    return { accepted: true, state: getOutputState() };
  };

  const setOutputDisplay = (payload) => {
    const type = typeof payload?.type === 'string' ? payload.type : '';
    if (!DISPLAY_ASSIGNMENT_TYPES.has(type)) return { accepted: false, reason: 'invalid-output-type' };
    const displayId = payload?.displayId;
    if (displayId !== null && displayId !== undefined && !getDisplay(displayId)) return { accepted: false, reason: 'unknown-display' };
    if (displayId === null || displayId === undefined || displayId === '') delete config.assignments[type];
    else config.assignments[type] = displayId;
    if (!saveConfig()) return { accepted: false, reason: 'config-write-failed' };
    [...windows.values()]
      .filter((entry) => entry.descriptor.type === type && !entry.window.isDestroyed?.())
      .forEach((entry) => applyDisplayPlacement(entry.window, type));
    publishState();
    return { accepted: true, state: getOutputState() };
  };

  const setOutputFullscreen = (payload) => {
    const descriptor = normalizeOutputDescriptor(payload);
    if (!descriptor || typeof payload?.fullscreen !== 'boolean') return { accepted: false, reason: 'invalid-output' };
    const entry = windows.get(descriptor.key);
    if (!entry || entry.window.isDestroyed?.()) return { accepted: false, reason: 'not-open', state: getOutputState() };
    if (payload.fullscreen && !getDisplay(getAssignment(descriptor.type))) return { accepted: false, reason: 'no-assigned-display', state: getOutputState() };
    entry.window.setFullScreen(payload.fullscreen);
    publishState();
    return { accepted: true, state: getOutputState() };
  };

  const handleDisplaysChanged = () => {
    [...windows.values()].forEach(({ descriptor, window }) => {
      const assignedDisplayId = getAssignment(descriptor.type);
      if (assignedDisplayId !== null && assignedDisplayId !== undefined && !window.isDestroyed?.() && !getDisplay(assignedDisplayId)) {
        applyNormalBounds(window);
      }
    });
    publishState();
  };

  const isTrustedSender = (event) => isTrustedRendererUrl(event?.sender?.getURL?.() || '');
  const rejectUntrusted = () => ({ accepted: false, reason: 'untrusted-sender' });

  const registerIpc = () => {
    ipcMain.handle(OUTPUT_IPC_CHANNELS.getDisplays, (event) => isTrustedSender(event) ? getDisplays() : null);
    ipcMain.handle(OUTPUT_IPC_CHANNELS.getState, (event) => isTrustedSender(event) ? getOutputState() : null);
    ipcMain.handle(OUTPUT_IPC_CHANNELS.open, (event, payload) => isTrustedSender(event) ? openOutput(payload) : rejectUntrusted());
    ipcMain.handle(OUTPUT_IPC_CHANNELS.focus, (event, payload) => isTrustedSender(event) ? focusOutput(payload) : rejectUntrusted());
    ipcMain.handle(OUTPUT_IPC_CHANNELS.close, (event, payload) => isTrustedSender(event) ? closeOutput(payload) : rejectUntrusted());
    ipcMain.handle(OUTPUT_IPC_CHANNELS.setDisplay, (event, payload) => isTrustedSender(event) ? setOutputDisplay(payload) : rejectUntrusted());
    ipcMain.handle(OUTPUT_IPC_CHANNELS.setFullscreen, (event, payload) => isTrustedSender(event) ? setOutputFullscreen(payload) : rejectUntrusted());
  };

  const initialize = () => {
    if (initialized) return getOutputState();
    initialized = true;
    registerIpc();
    screen.on('display-added', handleDisplaysChanged);
    screen.on('display-removed', handleDisplaysChanged);
    screen.on('display-metrics-changed', handleDisplaysChanged);
    return getOutputState();
  };

  const handleWindowOpen = ({ openerUrl, targetUrl }) => {
    if (!isTrustedRendererUrl(openerUrl)) return false;
    const descriptor = classifyOutputUrl(targetUrl, isTrustedRendererUrl);
    if (!descriptor) return false;
    openOutput(descriptor);
    return true;
  };

  return {
    initialize,
    openOutput,
    focusOutput,
    closeOutput,
    closeAllOutputs,
    getOutputState,
    setOutputDisplay,
    setOutputFullscreen,
    getDisplays,
    handleDisplaysChanged,
    handleWindowOpen
  };
};

module.exports = {
  OUTPUT_STATE_CHANNEL,
  OUTPUT_IPC_CHANNELS,
  OUTPUT_TYPES,
  isInternalKadoshUrl,
  outputKey,
  getOutputRoute,
  normalizeOutputDescriptor,
  classifyOutputUrl,
  serializeDisplay,
  readOutputConfig,
  writeOutputConfig,
  createOutputWindowManager
};
