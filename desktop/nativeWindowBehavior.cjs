'use strict';

const { APP_HOST, APP_SCHEME } = require('./productionRouting.cjs');

const OFFICIAL_CHAT_EXTERNAL_HOSTS = new Set([
  'gemini.google.com',
  'chatgpt.com',
  'chat.openai.com'
]);

const validateOfficialChatExternalUrl = (rawUrl) => {
  try {
    const parsed = new URL(String(rawUrl || '').trim());
    if (parsed.protocol !== 'https:') return null;
    if (parsed.username || parsed.password) return null;
    if (!OFFICIAL_CHAT_EXTERNAL_HOSTS.has(parsed.hostname.toLowerCase())) return null;
    return parsed.toString();
  } catch {
    return null;
  }
};

const ELECTRON_SCROLLBAR_CSS = `
  html::-webkit-scrollbar,
  body::-webkit-scrollbar,
  *::-webkit-scrollbar {
    display: none;
    width: 0;
    height: 0;
  }
`;

const isInternalKadoshUrl = (url) => {
  try {
    const parsed = new URL(url);
    return parsed.protocol === `${APP_SCHEME}:` && parsed.hostname === APP_HOST;
  } catch {
    return false;
  }
};

const attachNativeWindowBehavior = (webContents, BrowserWindow) => {
  const insertInternalScrollbarCss = () => {
    if (!isInternalKadoshUrl(webContents.getURL())) return;
    webContents.insertCSS(ELECTRON_SCROLLBAR_CSS).catch((error) => {
      console.warn('No se pudo ocultar la barra de desplazamiento de Electron:', error);
    });
  };

  webContents.on('did-finish-load', insertInternalScrollbarCss);
  webContents.on('before-input-event', (event, input) => {
    if (!isInternalKadoshUrl(webContents.getURL()) || input.type !== 'keyDown' || input.isAutoRepeat) return;

    const window = BrowserWindow.fromWebContents(webContents);
    if (!window) return;

    if (input.key === 'F11') {
      event.preventDefault();
      window.setFullScreen(!window.isFullScreen());
      return;
    }

    if (input.key === 'Escape' && window.isFullScreen()) {
      event.preventDefault();
      window.setFullScreen(false);
    }
  });
};

module.exports = {
  ELECTRON_SCROLLBAR_CSS,
  OFFICIAL_CHAT_EXTERNAL_HOSTS,
  validateOfficialChatExternalUrl,
  attachNativeWindowBehavior,
  isInternalKadoshUrl
};
