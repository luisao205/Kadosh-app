import React, { useEffect, useMemo, useState } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { Download, Monitor, RefreshCw, Rocket, Smartphone, Save, ShieldAlert } from 'lucide-react';
import { getUpdateDecision, saveAppUpdateConfig, subscribeAppUpdates } from '../../utils/appUpdates';
import { isAdmin, isMultimedia, isOwner } from '../../utils/rolePermissions';
import { useFeedback } from '../ui/FeedbackProvider';

const AndroidUpdater = registerPlugin('KadoshUpdater');

const emptyConfig = {
  latestVersion: '',
  minimumVersion: '',
  downloadUrl: '',
  forceUpdate: false,
  releaseNotes: '',
  status: 'draft',
  publishedAt: null
};

const getDesktopUpdater = () => typeof window === 'undefined' ? null : window.kadoshDesktop?.updater || null;

const UpdateCard = ({ icon, title, installedVersion, config, decision, action, actionLabel, actionDisabled }) => (
  <div className="kp-card rounded-3xl border border-white/10 p-5 md:p-6">
    <div className="flex items-start justify-between gap-4">
      <div className="flex min-w-0 items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-400/10 text-cyan-300">{icon}</div>
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">{title}</p>
          <h2 className="mt-1 text-xl font-black text-white">Kadosh App</h2>
          <div className="mt-3 space-y-1 text-sm font-semibold text-zinc-400">
            <p>Versión instalada: <span className="text-zinc-100">{installedVersion || 'No disponible'}</span></p>
            <p>Última publicada: <span className="text-zinc-100">{config.latestVersion || 'Sin publicar'}</span></p>
            {config.minimumVersion && <p>Versión mínima: <span className="text-zinc-100">{config.minimumVersion}</span></p>}
          </div>
        </div>
      </div>
      {decision?.required && <ShieldAlert size={22} className="shrink-0 text-amber-300" />}
    </div>

    {config.releaseNotes && (
      <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
        <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Notas de versión</p>
        <p className="mt-2 whitespace-pre-wrap text-sm font-medium leading-relaxed text-zinc-300">{config.releaseNotes}</p>
      </div>
    )}

    <div className="mt-5 flex flex-wrap items-center gap-2">
      {decision?.available ? (
        <button type="button" onClick={action} disabled={actionDisabled} className="kp-button-primary inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-black uppercase disabled:cursor-not-allowed disabled:opacity-50">
          <Rocket size={15} /> {actionLabel}
        </button>
      ) : (
        <span className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs font-black uppercase tracking-wide text-emerald-300">
          {installedVersion && config.latestVersion ? 'Actualizado' : 'Sin actualización publicada'}
        </span>
      )}
      {decision?.required && <span className="text-xs font-bold text-amber-300">Actualización obligatoria</span>}
    </div>
  </div>
);

const PlatformEditor = ({ platform, value, onChange, onSave, onPublish, saving }) => (
  <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
    <div className="mb-4 flex items-center justify-between gap-3">
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">Administración</p>
        <h3 className="mt-1 text-lg font-black text-white">{platform === 'android' ? 'Android' : 'Windows'}</h3>
      </div>
      <select value={value.status} onChange={(event) => onChange({ ...value, status: event.target.value })} className="kp-input rounded-xl px-3 py-2 text-xs font-bold">
        <option value="draft">Borrador</option>
        <option value="testing">Testing</option>
        <option value="published">Publicado</option>
      </select>
    </div>

    <div className="grid gap-3 md:grid-cols-2">
      <label className="text-xs font-bold text-zinc-400">Última versión
        <input value={value.latestVersion} onChange={(event) => onChange({ ...value, latestVersion: event.target.value })} placeholder="1.1.2" className="kp-input mt-1 w-full rounded-xl px-3 py-2.5" />
      </label>
      <label className="text-xs font-bold text-zinc-400">Versión mínima
        <input value={value.minimumVersion} onChange={(event) => onChange({ ...value, minimumVersion: event.target.value })} placeholder="1.1.1" className="kp-input mt-1 w-full rounded-xl px-3 py-2.5" />
      </label>
      <label className="md:col-span-2 text-xs font-bold text-zinc-400">URL de descarga {platform === 'android' ? 'APK' : '(opcional)'}
        <input value={value.downloadUrl} onChange={(event) => onChange({ ...value, downloadUrl: event.target.value })} placeholder="https://..." className="kp-input mt-1 w-full rounded-xl px-3 py-2.5" />
      </label>
      <label className="md:col-span-2 text-xs font-bold text-zinc-400">Notas de versión
        <textarea value={value.releaseNotes} onChange={(event) => onChange({ ...value, releaseNotes: event.target.value })} rows={4} className="kp-input mt-1 w-full resize-y rounded-xl px-3 py-2.5" />
      </label>
      <label className="md:col-span-2 flex items-center gap-2 text-sm font-bold text-zinc-300">
        <input type="checkbox" checked={value.forceUpdate} onChange={(event) => onChange({ ...value, forceUpdate: event.target.checked })} />
        Forzar actualización
      </label>
    </div>

    <div className="mt-4 flex flex-wrap gap-2">
      <button type="button" disabled={saving} onClick={onSave} className="kp-button-secondary inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-black uppercase disabled:opacity-50"><Save size={14} /> Guardar</button>
      <button type="button" disabled={saving} onClick={onPublish} className="kp-button-primary inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-black uppercase disabled:opacity-50"><Rocket size={14} /> Publicar</button>
    </div>
  </div>
);

const UpdateCenter = ({ user }) => {
  const { notify } = useFeedback();
  const desktopUpdater = useMemo(getDesktopUpdater, []);
  const [updates, setUpdates] = useState({ windows: emptyConfig, android: emptyConfig });
  const [desktopState, setDesktopState] = useState({ status: 'idle', currentVersion: '', availableVersion: null });
  const [androidVersion, setAndroidVersion] = useState('');
  const [editors, setEditors] = useState({ windows: emptyConfig, android: emptyConfig });
  const [saving, setSaving] = useState(false);
  const [installingAndroid, setInstallingAndroid] = useState(false);
  const canManage = isOwner(user) || isAdmin(user) || isMultimedia(user);

  useEffect(() => subscribeAppUpdates((next) => {
    setUpdates(next);
    setEditors(next);
  }, (error) => console.warn('No se pudo cargar el centro de actualizaciones:', error)), []);

  useEffect(() => {
    if (!desktopUpdater) return undefined;
    let active = true;
    desktopUpdater.getUpdateState().then((state) => active && state && setDesktopState(state));
    return desktopUpdater.onStateChange((state) => active && state && setDesktopState(state));
  }, [desktopUpdater]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    CapacitorApp.getInfo().then((info) => setAndroidVersion(info.version || '')).catch(() => {});
  }, []);

  const windowsDecision = getUpdateDecision({ installedVersion: desktopState.currentVersion, config: updates.windows });
  const androidDecision = getUpdateDecision({ installedVersion: androidVersion, config: updates.android });

  const installWindows = async () => {
    if (!desktopUpdater) return;
    if (desktopState.status === 'downloaded') {
      await desktopUpdater.installUpdate();
      return;
    }
    await desktopUpdater.checkForUpdates();
  };

  const installAndroid = async () => {
    if (!Capacitor.isNativePlatform() || !updates.android.downloadUrl) return;
    setInstallingAndroid(true);
    try {
      await AndroidUpdater.installApk({ url: updates.android.downloadUrl });
    } catch (error) {
      console.error('No se pudo abrir el instalador APK:', error);
      notify('No se pudo descargar o abrir el instalador de Android.', { type: 'error' });
    } finally {
      setInstallingAndroid(false);
    }
  };

  const persist = async (platform, publish) => {
    setSaving(true);
    try {
      await saveAppUpdateConfig({ platform, config: editors[platform], publish });
      notify(publish ? 'Actualización publicada.' : 'Configuración guardada.', { type: 'success' });
    } catch (error) {
      console.error('Error guardando actualización:', error);
      notify(error.message || 'No se pudo guardar la actualización.', { type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl animate-in fade-in duration-500">
      <header className="mb-6 rounded-3xl border border-white/10 bg-zinc-950/45 p-5 md:p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-400/10 text-cyan-300"><RefreshCw size={22} /></div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-300">Kadosh App</p>
            <h1 className="text-3xl font-black text-white">Centro de Actualizaciones</h1>
            <p className="mt-1 text-sm font-medium text-zinc-400">Windows y Android desde un solo lugar.</p>
          </div>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <UpdateCard
          icon={<Monitor size={20} />}
          title="Windows"
          installedVersion={desktopState.currentVersion}
          config={updates.windows}
          decision={windowsDecision}
          action={installWindows}
          actionLabel={desktopState.status === 'downloaded' ? 'Reiniciar y actualizar' : 'Buscar y descargar'}
          actionDisabled={!desktopUpdater}
        />
        <UpdateCard
          icon={<Smartphone size={20} />}
          title="Android"
          installedVersion={androidVersion}
          config={updates.android}
          decision={androidDecision}
          action={installAndroid}
          actionLabel={installingAndroid ? 'Preparando APK...' : 'Descargar APK'}
          actionDisabled={!Capacitor.isNativePlatform() || installingAndroid || !updates.android.downloadUrl}
        />
      </div>

      {canManage && (
        <section className="kp-card mt-6 rounded-3xl border border-white/10 p-5 md:p-6">
          <div className="mb-5">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">Control administrativo</p>
            <h2 className="mt-1 text-2xl font-black text-white">Publicación de versiones</h2>
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <PlatformEditor platform="windows" value={editors.windows} onChange={(value) => setEditors((current) => ({ ...current, windows: value }))} onSave={() => persist('windows', false)} onPublish={() => persist('windows', true)} saving={saving} />
            <PlatformEditor platform="android" value={editors.android} onChange={(value) => setEditors((current) => ({ ...current, android: value }))} onSave={() => persist('android', false)} onPublish={() => persist('android', true)} saving={saving} />
          </div>
        </section>
      )}
    </div>
  );
};

export default UpdateCenter;
