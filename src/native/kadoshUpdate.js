import { Capacitor, registerPlugin } from '@capacitor/core';

const KadoshUpdate = registerPlugin('KadoshUpdate');

export const canUseNativeAndroidUpdater = () => Capacitor.getPlatform() === 'android';

export const installAndroidUpdate = async ({ url, version }) => {
  if (!canUseNativeAndroidUpdater()) throw new Error('El instalador nativo solo está disponible en Android.');
  if (!url) throw new Error('No hay una URL de APK disponible.');
  return KadoshUpdate.downloadAndInstall({ url, version: String(version || '') });
};
