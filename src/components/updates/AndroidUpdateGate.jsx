import React, { useEffect, useState } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { Download, ShieldAlert } from 'lucide-react';
import { getUpdateDecision, subscribeAppUpdates } from '../../utils/appUpdates';

const AndroidUpdater = registerPlugin('KadoshUpdater');

const AndroidUpdateGate = ({ children }) => {
  const [installedVersion, setInstalledVersion] = useState('');
  const [config, setConfig] = useState(null);
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined;
    let unsubscribeUpdates = null;
    CapacitorApp.getInfo().then((info) => setInstalledVersion(info.version || '')).catch(() => {});

    const unsubscribeAuth = onAuthStateChanged(getAuth(), (firebaseUser) => {
      unsubscribeUpdates?.();
      unsubscribeUpdates = null;
      if (!firebaseUser) {
        setConfig(null);
        return;
      }
      unsubscribeUpdates = subscribeAppUpdates((updates) => setConfig(updates.android), (nextError) => {
        console.warn('No se pudo comprobar la actualización Android:', nextError);
      });
    });

    return () => {
      unsubscribeUpdates?.();
      unsubscribeAuth();
    };
  }, []);

  if (!Capacitor.isNativePlatform() || !config || !installedVersion) return children;

  const decision = getUpdateDecision({ installedVersion, config });
  if (!decision.required) return children;

  const install = async () => {
    if (!decision.config.downloadUrl || installing) return;
    setInstalling(true);
    setError('');
    try {
      await AndroidUpdater.installApk({ url: decision.config.downloadUrl });
    } catch (installError) {
      console.error('No se pudo iniciar la actualización obligatoria:', installError);
      setError('No se pudo descargar o abrir el instalador. Revisa tu conexión e inténtalo nuevamente.');
    } finally {
      setInstalling(false);
    }
  };

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

        {error && <p className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 p-3 text-sm font-bold text-red-300">{error}</p>}

        <button
          type="button"
          onClick={install}
          disabled={installing || !decision.config.downloadUrl}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-amber-400 px-5 py-3.5 text-sm font-black uppercase tracking-wide text-zinc-950 transition-colors hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Download size={18} /> {installing ? 'Preparando actualización...' : 'Actualizar ahora'}
        </button>
        {!decision.config.downloadUrl && <p className="mt-3 text-center text-xs font-bold text-red-300">El administrador todavía no publicó una URL de APK válida.</p>}
      </div>
    </div>
  );
};

export default AndroidUpdateGate;
