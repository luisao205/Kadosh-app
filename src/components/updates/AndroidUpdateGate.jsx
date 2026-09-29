import { useEffect, useState } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { Download, ShieldAlert, X } from 'lucide-react';
import {
  fetchPublishedAndroidUpdate,
  getAndroidReleaseApkUrl,
  getUpdateDecision,
  subscribeAppUpdates
} from '../../utils/appUpdates';
import { installAndroidUpdate } from '../../native/kadoshUpdate';

const PUBLIC_CHECK_INTERVAL_MS = 60_000;

const AndroidUpdateGate = ({ children }) => {
  const [installedVersion, setInstalledVersion] = useState('');
  const [config, setConfig] = useState(null);
  const [dismissedVersion, setDismissedVersion] = useState('');
  const [installing, setInstalling] = useState(false);
  const [installMessage, setInstallMessage] = useState('');
  const isAndroid = Capacitor.getPlatform() === 'android';

  useEffect(() => {
    if (!isAndroid) return undefined;
    let unsubscribeUpdates = null;
    let unsubscribeAuth = null;
    let appStateListener = null;
    let publicCheckTimer = null;
    let authenticated = false;
    let cancelled = false;

    const stopPublicPolling = () => {
      if (!publicCheckTimer) return;
      window.clearInterval(publicCheckTimer);
      publicCheckTimer = null;
    };

    const refreshInstalledVersion = async () => {
      try {
        const info = await CapacitorApp.getInfo();
        if (!cancelled) setInstalledVersion(info.version || '');
      } catch {
        // La versión se volverá a consultar al siguiente arranque/resume.
      }
    };

    const refreshPublicConfig = async () => {
      try {
        const nextConfig = await fetchPublishedAndroidUpdate();
        if (!cancelled) setConfig(nextConfig);
      } catch (error) {
        // La Function se desplegará junto con este updater. Mientras tanto,
        // una sesión autenticada seguirá usando el listener Firestore existente.
        console.warn('No se pudo consultar la actualización Android pública:', error);
      }
    };

    const startPublicPolling = () => {
      stopPublicPolling();
      void refreshPublicConfig();
      publicCheckTimer = window.setInterval(() => void refreshPublicConfig(), PUBLIC_CHECK_INTERVAL_MS);
    };

    const subscribeAuthenticatedConfig = () => {
      unsubscribeUpdates?.();
      unsubscribeUpdates = subscribeAppUpdates((updates) => {
        if (!cancelled) setConfig(updates.android);
      }, (error) => console.warn('No se pudo escuchar la actualización Android:', error));
    };

    void refreshInstalledVersion();
    startPublicPolling();

    unsubscribeAuth = onAuthStateChanged(getAuth(), (firebaseUser) => {
      authenticated = Boolean(firebaseUser);
      unsubscribeUpdates?.();
      unsubscribeUpdates = null;

      if (authenticated) {
        subscribeAuthenticatedConfig();
      } else {
        startPublicPolling();
      }
    });

    CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) return;
      void refreshInstalledVersion();
      void refreshPublicConfig();
    }).then((handle) => {
      if (cancelled) handle.remove();
      else appStateListener = handle;
    }).catch(() => {});

    return () => {
      cancelled = true;
      unsubscribeUpdates?.();
      unsubscribeAuth?.();
      appStateListener?.remove();
      stopPublicPolling();
    };
  }, [isAndroid]);

  if (!isAndroid || !config || !installedVersion) return children;

  const decision = getUpdateDecision({ installedVersion, config });
  const downloadUrl = decision.config.downloadUrl || getAndroidReleaseApkUrl(decision.config.latestVersion);

  const install = async () => {
    if (!downloadUrl || installing) return;
    setInstalling(true);
    setInstallMessage('Descargando actualización…');
    try {
      const result = await installAndroidUpdate({
        url: downloadUrl,
        version: decision.config.latestVersion
      });
      if (result?.permissionRequired) {
        setInstallMessage('Activa “Permitir desde esta fuente”, vuelve a Kadosh y pulsa Actualizar ahora otra vez.');
      } else {
        setInstallMessage('El instalador de Android está listo. Confirma la actualización para continuar.');
      }
    } catch (error) {
      console.error('No se pudo instalar la actualización Android:', error);
      setInstallMessage(error?.message || 'No se pudo descargar o abrir la actualización.');
    } finally {
      setInstalling(false);
    }
  };

  if (decision.required) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-6">
        <div className="w-full max-w-xl rounded-[2rem] border border-amber-500/25 bg-zinc-900/90 p-7 shadow-2xl shadow-black/40 md:p-9">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl border border-amber-400/25 bg-amber-400/10 text-amber-300">
            <ShieldAlert size={30} />
          </div>
          <div className="mt-5 text-center">
            <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-300">Actualización necesaria</p>
            <h1 className="mt-2 text-3xl font-black">Debes actualizar Kadosh App</h1>
            <p className="mt-3 text-sm font-medium leading-relaxed text-zinc-400">
              Hay una nueva versión necesaria para continuar usando la aplicación.
            </p>
          </div>

          <div className="mt-6 grid gap-3 rounded-3xl border border-white/10 bg-black/20 p-4 sm:grid-cols-2">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Versión instalada</p>
              <p className="mt-1 text-lg font-black text-zinc-100">{installedVersion}</p>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Versión requerida</p>
              <p className="mt-1 text-lg font-black text-zinc-100">{decision.config.minimumVersion || decision.config.latestVersion}</p>
            </div>
          </div>

          {decision.config.releaseNotes && (
            <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Notas de versión</p>
              <p className="mt-2 whitespace-pre-wrap text-sm font-medium leading-relaxed text-zinc-300">{decision.config.releaseNotes}</p>
            </div>
          )}

          <button
            type="button"
            onClick={install}
            disabled={!downloadUrl || installing}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-amber-400 px-5 py-3.5 text-sm font-black uppercase tracking-wide text-zinc-950 transition-colors hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download size={18} /> {installing ? 'Descargando…' : 'Actualizar ahora'}
          </button>
          {installMessage && <p className="mt-3 text-center text-xs font-bold leading-relaxed text-amber-200">{installMessage}</p>}
          {!downloadUrl && <p className="mt-3 text-center text-xs font-bold text-red-300">No hay un APK publicado para esta versión.</p>}
        </div>
      </div>
    );
  }

  const showOptional = decision.available && dismissedVersion !== decision.config.latestVersion;

  return (
    <>
      {children}
      {showOptional && (
        <div className="fixed inset-x-4 bottom-4 z-[110] mx-auto max-w-lg rounded-3xl border border-cyan-400/20 bg-zinc-900/95 p-5 text-white shadow-2xl shadow-black/50 backdrop-blur md:bottom-6">
          <button type="button" onClick={() => setDismissedVersion(decision.config.latestVersion)} className="absolute right-4 top-4 text-zinc-500 hover:text-white" aria-label="Cerrar aviso de actualización"><X size={18} /></button>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-300">Nueva actualización disponible</p>
          <h2 className="mt-1 pr-8 text-xl font-black">Kadosh App {decision.config.latestVersion}</h2>
          <p className="mt-2 text-sm font-medium text-zinc-400">Tienes instalada la versión {installedVersion}.</p>
          {decision.config.releaseNotes && <p className="mt-3 line-clamp-3 text-sm font-medium leading-relaxed text-zinc-300">{decision.config.releaseNotes}</p>}
          {installMessage && <p className="mt-3 text-xs font-bold leading-relaxed text-cyan-200">{installMessage}</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={install} disabled={!downloadUrl || installing} className="kp-button-primary inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-black uppercase disabled:opacity-50"><Download size={14} /> {installing ? 'Descargando…' : 'Actualizar ahora'}</button>
            <button type="button" onClick={() => setDismissedVersion(decision.config.latestVersion)} className="kp-button-secondary rounded-xl px-4 py-2.5 text-xs font-black uppercase">Más tarde</button>
          </div>
        </div>
      )}
    </>
  );
};

export default AndroidUpdateGate;
