import React, { useEffect, useState } from 'react';
import { CheckCircle2, Download, RefreshCw, Rocket, RotateCw } from 'lucide-react';

const initialState = {
  status: 'idle',
  currentVersion: '',
  availableVersion: null,
  percent: null,
  message: ''
};

export const getDesktopUpdater = () => (
  typeof window === 'undefined' ? null : window.kadoshDesktop?.updater || null
);

const getStatusLabel = (state) => {
  if (state.status === 'checking') return 'Buscando actualizaciones';
  if (state.status === 'available') return `Nueva versión ${state.availableVersion || ''}`.trim();
  if (state.status === 'downloading') return `Descargando... ${state.percent ?? 0}%`;
  if (state.status === 'downloaded') return `Actualización ${state.availableVersion || ''} lista`.trim();
  if (state.status === 'up-to-date') return 'Actualizado';
  if (state.status === 'error') return 'No se pudo comprobar actualizaciones.';
  return 'Listo para comprobar actualizaciones';
};

const DesktopUpdateStatus = () => {
  const [updater] = useState(getDesktopUpdater);
  const [state, setState] = useState(initialState);

  useEffect(() => {
    if (!updater) return undefined;
    let active = true;
    updater.getUpdateState().then((nextState) => {
      if (active && nextState) setState(nextState);
    });
    return updater.onStateChange((nextState) => {
      if (active && nextState) setState(nextState);
    });
  }, [updater]);

  if (!updater) return null;

  const isChecking = state.status === 'checking' || state.status === 'downloading';

  return (
    <section className="kp-card rounded-2xl border border-white/10 p-4 md:p-5" aria-label="Actualizaciones de Kadosh App">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-400/10 text-cyan-300">
            {state.status === 'downloaded' ? <Rocket size={18} /> : state.status === 'up-to-date' ? <CheckCircle2 size={18} /> : <Download size={18} />}
          </span>
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-widest text-zinc-300">Kadosh App {state.currentVersion ? `v${state.currentVersion}` : ''}</p>
            <p className="mt-0.5 truncate text-xs font-semibold text-zinc-500">{getStatusLabel(state)}</p>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          {state.status === 'downloaded' ? (
            <button type="button" onClick={() => updater.installUpdate()} className="flex items-center gap-2 rounded-xl bg-cyan-500 px-3 py-2 text-[11px] font-black uppercase text-zinc-950 transition-colors hover:bg-cyan-400">
              <Rocket size={14} /> Reiniciar y actualizar
            </button>
          ) : (
            <button type="button" onClick={() => updater.checkForUpdates()} disabled={isChecking} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] font-black uppercase text-zinc-200 transition-colors hover:bg-white/[0.08] disabled:cursor-wait disabled:opacity-60">
              {isChecking ? <RotateCw size={14} className="animate-spin" /> : <RefreshCw size={14} />} Buscar actualizaciones
            </button>
          )}
        </div>
      </div>
      {state.status === 'downloading' && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.08]" aria-label={`Descarga ${state.percent ?? 0}%`}>
          <div className="h-full rounded-full bg-cyan-400 transition-[width] duration-300" style={{ width: `${state.percent ?? 0}%` }} />
        </div>
      )}
    </section>
  );
};

export default DesktopUpdateStatus;
