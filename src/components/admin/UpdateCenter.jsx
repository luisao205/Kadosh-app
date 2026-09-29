import { useEffect, useState } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { CheckCircle2, Download, ExternalLink, Monitor, RefreshCw, Rocket, Smartphone } from 'lucide-react';
import {
  fetchLatestGitHubRelease,
  getUpdateDecision,
  publishDetectedAndroidRelease,
  subscribeAppUpdates
} from '../../utils/appUpdates';
import { canUseNativeAndroidUpdater, installAndroidUpdate } from '../../native/kadoshUpdate';
import { isOwner } from '../../utils/rolePermissions';
import { useFeedback } from '../ui/FeedbackProvider';

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

const formatBytes = (bytes) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

const openExternal = (url) => {
  if (!url) return;
  window.open(url, '_blank', 'noopener,noreferrer');
};

const DesktopStatus = ({ updater, state }) => {
  const busy = ['checking', 'downloading'].includes(state.status);
  const installReady = state.status === 'downloaded';
  const label = installReady
    ? 'Reiniciar y actualizar'
    : state.status === 'downloading'
      ? `Descargando${Number.isFinite(state.progress?.percent) ? ` ${Math.round(state.progress.percent)}%` : '…'}`
      : state.status === 'checking'
        ? 'Comprobando…'
        : 'Comprobar actualizaciones';

  const action = async () => {
    if (!updater || busy) return;
    if (installReady) await updater.installUpdate();
    else await updater.checkForUpdates();
  };

  return (
    <div className="kp-card rounded-3xl border border-white/10 p-5 md:p-6">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-400/10 text-cyan-300"><Monitor size={20} /></div>
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">Windows</p>
          <h2 className="mt-1 text-xl font-black text-white">Kadosh App</h2>
          <p className="mt-3 text-sm font-semibold text-zinc-400">Versión instalada: <span className="text-zinc-100">{state.currentVersion || 'No disponible'}</span></p>
          {state.availableVersion && <p className="mt-1 text-sm font-semibold text-zinc-400">Versión detectada: <span className="text-zinc-100">{state.availableVersion}</span></p>}
          <p className="mt-3 max-w-xl text-xs font-medium leading-relaxed text-zinc-500">Windows consulta GitHub Releases directamente. No necesita publicación manual desde este panel.</p>
        </div>
      </div>
      <button type="button" onClick={action} disabled={!updater || busy} className="kp-button-primary mt-5 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-black uppercase disabled:cursor-not-allowed disabled:opacity-50">
        <RefreshCw size={15} className={busy ? 'animate-spin' : ''} /> {label}
      </button>
    </div>
  );
};

const AndroidStatus = ({ installedVersion, config }) => {
  const { notify } = useFeedback();
  const [installing, setInstalling] = useState(false);
  const decision = getUpdateDecision({ installedVersion, config });

  const install = async () => {
    if (!decision.available || !config.downloadUrl || !canUseNativeAndroidUpdater() || installing) return;
    setInstalling(true);
    try {
      await installAndroidUpdate({ url: config.downloadUrl, version: config.latestVersion });
    } catch (error) {
      console.error('No se pudo abrir el instalador Android:', error);
      notify(error?.message || 'No se pudo iniciar la actualización Android.', { type: 'error' });
    } finally {
      setInstalling(false);
    }
  };

  return (
    <div className="kp-card rounded-3xl border border-white/10 p-5 md:p-6">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-400/10 text-cyan-300"><Smartphone size={20} /></div>
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">Android</p>
          <h2 className="mt-1 text-xl font-black text-white">Kadosh App</h2>
          <p className="mt-3 text-sm font-semibold text-zinc-400">Versión instalada: <span className="text-zinc-100">{installedVersion || 'No disponible'}</span></p>
          <p className="mt-1 text-sm font-semibold text-zinc-400">Última publicada: <span className="text-zinc-100">{config.latestVersion || 'Sin publicar'}</span></p>
          <p className="mt-3 max-w-xl text-xs font-medium leading-relaxed text-zinc-500">Al publicar una release Android, los APK instalados reciben el aviso y las versiones anteriores quedan bloqueadas hasta actualizar.</p>
        </div>
      </div>
      {decision.available && canUseNativeAndroidUpdater() && (
        <button type="button" onClick={install} disabled={installing || !config.downloadUrl} className="kp-button-primary mt-5 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-black uppercase disabled:opacity-50">
          <Download size={15} /> {installing ? 'Preparando…' : 'Actualizar ahora'}
        </button>
      )}
    </div>
  );
};

const DetectedRelease = ({ release, loading, error, publishedConfig, onRefresh, onPublish, publishing }) => {
  const alreadyPublished = Boolean(
    release?.version
    && publishedConfig.status === 'published'
    && publishedConfig.latestVersion === release.version
  );

  return (
    <section className="kp-card mt-6 rounded-3xl border border-white/10 p-5 md:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-violet-300">Publicación Android · Dueño</p>
          <h2 className="mt-1 text-2xl font-black text-white">Release detectada automáticamente</h2>
          <p className="mt-2 max-w-2xl text-sm font-medium text-zinc-400">Kadosh lee la última GitHub Release. Tú solo revisas la versión detectada y pulsas Publicar Android.</p>
        </div>
        <button type="button" onClick={onRefresh} disabled={loading} className="kp-button-secondary inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-black uppercase disabled:opacity-50">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Actualizar detección
        </button>
      </div>

      {error && <p className="mt-5 rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm font-bold text-rose-200">{error}</p>}
      {!error && loading && !release && <p className="mt-5 text-sm font-bold text-zinc-500">Consultando GitHub Releases…</p>}

      {release && (
        <div className="mt-5 rounded-3xl border border-white/10 bg-black/20 p-5">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div><p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Versión</p><p className="mt-1 text-xl font-black text-white">{release.version}</p></div>
            <div><p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">APK</p><p className={`mt-1 text-sm font-black ${release.android ? 'text-emerald-300' : 'text-rose-300'}`}>{release.android ? `${release.android.name}${release.android.size ? ` · ${formatBytes(release.android.size)}` : ''}` : 'No encontrado'}</p></div>
            <div><p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Windows</p><p className={`mt-1 text-sm font-black ${release.windows ? 'text-emerald-300' : 'text-zinc-500'}`}>{release.windows?.name || 'Sin instalador'}</p></div>
            <div><p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Estado Android</p><p className={`mt-1 text-sm font-black ${alreadyPublished ? 'text-emerald-300' : 'text-amber-300'}`}>{alreadyPublished ? 'Publicado' : 'Listo para publicar'}</p></div>
          </div>

          {release.releaseNotes && <p className="mt-4 whitespace-pre-wrap rounded-2xl border border-white/10 bg-zinc-950/50 p-4 text-sm font-medium leading-relaxed text-zinc-300">{release.releaseNotes}</p>}

          <div className="mt-5 flex flex-wrap gap-2">
            <button type="button" onClick={onPublish} disabled={publishing || alreadyPublished || !release.android?.url} className="kp-button-primary inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-black uppercase disabled:cursor-not-allowed disabled:opacity-50">
              {alreadyPublished ? <CheckCircle2 size={15} /> : <Rocket size={15} />} {alreadyPublished ? 'Android ya publicado' : publishing ? 'Publicando…' : 'Publicar Android'}
            </button>
            {release.releaseUrl && <button type="button" onClick={() => openExternal(release.releaseUrl)} className="kp-button-secondary inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-black uppercase"><ExternalLink size={14} /> Ver release</button>}
          </div>
          {!release.android?.url && <p className="mt-3 text-xs font-bold text-rose-300">La release no se puede publicar para Android hasta que contenga app-release.apk.</p>}
          {!alreadyPublished && release.android?.url && <p className="mt-3 text-xs font-bold text-amber-200">Publicar hará esta versión obligatoria para todos los APK anteriores y activará la notificación de actualización.</p>}
        </div>
      )}
    </section>
  );
};

const UpdateCenter = ({ user }) => {
  const { notify } = useFeedback();
  const [desktopUpdater] = useState(getDesktopUpdater);
  const [updates, setUpdates] = useState({ windows: emptyConfig, android: emptyConfig });
  const [desktopState, setDesktopState] = useState({ status: 'idle', currentVersion: '', availableVersion: null });
  const [androidVersion, setAndroidVersion] = useState('');
  const [release, setRelease] = useState(null);
  const [releaseLoading, setReleaseLoading] = useState(true);
  const [releaseError, setReleaseError] = useState('');
  const [publishing, setPublishing] = useState(false);
  const canManage = isOwner(user);

  useEffect(() => subscribeAppUpdates(setUpdates, (error) => console.warn('No se pudo cargar el centro de actualizaciones:', error)), []);

  useEffect(() => {
    if (!desktopUpdater) return undefined;
    let active = true;
    desktopUpdater.getUpdateState().then((state) => active && state && setDesktopState(state));
    const unsubscribe = desktopUpdater.onStateChange((state) => active && state && setDesktopState(state));
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [desktopUpdater]);

  useEffect(() => {
    if (Capacitor.getPlatform() !== 'android') return undefined;
    let active = true;
    CapacitorApp.getInfo().then((info) => active && setAndroidVersion(info.version || '')).catch(() => {});
    return () => { active = false; };
  }, []);

  const refreshRelease = async () => {
    setReleaseLoading(true);
    setReleaseError('');
    try {
      setRelease(await fetchLatestGitHubRelease());
    } catch (error) {
      console.error('No se pudo detectar la última release:', error);
      setReleaseError(error?.message || 'No se pudo consultar la última release.');
    } finally {
      setReleaseLoading(false);
    }
  };

  useEffect(() => {
    if (!canManage) return undefined;
    let active = true;
    fetchLatestGitHubRelease()
      .then((nextRelease) => {
        if (active) setRelease(nextRelease);
      })
      .catch((error) => {
        console.error('No se pudo detectar la última release:', error);
        if (active) setReleaseError(error?.message || 'No se pudo consultar la última release.');
      })
      .finally(() => {
        if (active) setReleaseLoading(false);
      });
    return () => { active = false; };
  }, [canManage]);

  const publishAndroid = async () => {
    if (!release || publishing || !canManage) return;
    setPublishing(true);
    try {
      await publishDetectedAndroidRelease(release);
      notify(`Android ${release.version} publicado. Los APK anteriores deberán actualizar.`, { type: 'success' });
    } catch (error) {
      console.error('No se pudo publicar Android:', error);
      notify(error?.message || 'No se pudo publicar la actualización Android.', { type: 'error' });
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl animate-in fade-in duration-500">
      <header className="mb-6 rounded-3xl border border-white/10 bg-zinc-950/45 p-5 md:p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-400/10 text-cyan-300"><RefreshCw size={22} /></div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-300">Kadosh App</p>
            <h1 className="text-3xl font-black text-white">Actualizaciones</h1>
            <p className="mt-1 text-sm font-medium text-zinc-400">Windows se actualiza por Electron. Android se publica aquí a partir de la release detectada.</p>
          </div>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <DesktopStatus updater={desktopUpdater} state={desktopState} />
        <AndroidStatus installedVersion={androidVersion} config={updates.android} />
      </div>

      {canManage && <DetectedRelease release={release} loading={releaseLoading} error={releaseError} publishedConfig={updates.android} onRefresh={refreshRelease} onPublish={publishAndroid} publishing={publishing} />}
    </div>
  );
};

export default UpdateCenter;
