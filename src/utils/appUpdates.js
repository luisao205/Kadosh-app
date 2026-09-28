import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { compareVersions, isValidVersion } from './versioning';

export const APP_UPDATES_DOC = 'appUpdates';
export const APP_UPDATES_PATH = ['sistema', APP_UPDATES_DOC];
export const UPDATE_STATUSES = ['draft', 'testing', 'published'];
export const GITHUB_RELEASES_BASE = 'https://github.com/luisao205/Kadosh-app/releases/download';
export const GITHUB_LATEST_RELEASE_API = 'https://api.github.com/repos/luisao205/Kadosh-app/releases/latest';

export const getAndroidReleaseApkUrl = (version) => {
  const normalizedVersion = String(version || '').trim().replace(/^v/i, '');
  if (!isValidVersion(normalizedVersion)) return '';
  return `${GITHUB_RELEASES_BASE}/v${normalizedVersion}/app-release.apk`;
};

const normalizePlatformUpdate = (value = {}) => ({
  latestVersion: String(value.latestVersion || '').trim(),
  minimumVersion: String(value.minimumVersion || '').trim(),
  downloadUrl: String(value.downloadUrl || value.apkUrl || '').trim(),
  forceUpdate: value.forceUpdate === true,
  releaseNotes: String(value.releaseNotes || '').trim(),
  releaseTag: String(value.releaseTag || '').trim(),
  releaseUrl: String(value.releaseUrl || '').trim(),
  assetName: String(value.assetName || '').trim(),
  status: UPDATE_STATUSES.includes(value.status) ? value.status : 'draft',
  publishedAt: value.publishedAt || null,
  updatedAt: value.updatedAt || null
});

export const normalizeAppUpdates = (value = {}) => ({
  windows: normalizePlatformUpdate(value.windows),
  android: normalizePlatformUpdate(value.android)
});

const normalizeReleaseAsset = (asset) => asset ? {
  name: String(asset.name || ''),
  url: String(asset.browser_download_url || ''),
  size: Number(asset.size || 0),
  digest: String(asset.digest || '')
} : null;

export const normalizeGitHubRelease = (release = {}) => {
  const tagName = String(release.tag_name || '').trim();
  const version = tagName.replace(/^v/i, '');
  const assets = Array.isArray(release.assets) ? release.assets : [];
  const androidAsset = assets.find((asset) => String(asset?.name || '').toLowerCase() === 'app-release.apk') || null;
  const windowsAsset = assets.find((asset) => /^Kadosh-App-Setup-.+\.exe$/i.test(String(asset?.name || ''))) || null;

  return {
    id: release.id || null,
    tagName,
    version: isValidVersion(version) ? version : '',
    name: String(release.name || tagName || ''),
    releaseNotes: String(release.body || '').trim(),
    publishedAt: release.published_at || null,
    releaseUrl: String(release.html_url || ''),
    android: normalizeReleaseAsset(androidAsset),
    windows: normalizeReleaseAsset(windowsAsset)
  };
};

export const fetchLatestGitHubRelease = async ({ fetchImpl = globalThis.fetch } = {}) => {
  if (typeof fetchImpl !== 'function') throw new Error('No hay un cliente HTTP disponible para consultar GitHub Releases.');
  const response = await fetchImpl(GITHUB_LATEST_RELEASE_API, {
    headers: { Accept: 'application/vnd.github+json' }
  });
  if (!response.ok) throw new Error(`No se pudo consultar GitHub Releases (${response.status}).`);
  const release = normalizeGitHubRelease(await response.json());
  if (!release.version) throw new Error('La última release no tiene una versión válida.');
  return release;
};

export const subscribeAppUpdates = (listener, onError) => onSnapshot(
  doc(db, ...APP_UPDATES_PATH),
  (snapshot) => listener(normalizeAppUpdates(snapshot.exists() ? snapshot.data() : {})),
  onError
);

export const getUpdateDecision = ({ installedVersion, config }) => {
  const normalized = normalizePlatformUpdate(config);
  if (normalized.status !== 'published' || !isValidVersion(installedVersion) || !isValidVersion(normalized.latestVersion)) {
    return { available: false, required: false, config: normalized };
  }

  const latestComparison = compareVersions(installedVersion, normalized.latestVersion);
  const minimumValid = isValidVersion(normalized.minimumVersion);
  const minimumComparison = minimumValid ? compareVersions(installedVersion, normalized.minimumVersion) : null;
  const available = latestComparison === -1;
  const required = available && (
    normalized.forceUpdate
    || (minimumValid && minimumComparison === -1)
  );

  return { available, required, config: normalized };
};

export const saveAppUpdateConfig = async ({ platform, config, publish = false }) => {
  if (!['windows', 'android'].includes(platform)) throw new Error('Plataforma de actualización inválida.');
  const normalized = normalizePlatformUpdate(config);
  if (!isValidVersion(normalized.latestVersion)) throw new Error('La versión más reciente no es válida.');
  if (normalized.minimumVersion && !isValidVersion(normalized.minimumVersion)) throw new Error('La versión mínima no es válida.');

  const resolvedDownloadUrl = platform === 'android' && !normalized.downloadUrl
    ? getAndroidReleaseApkUrl(normalized.latestVersion)
    : normalized.downloadUrl;
  const status = publish ? 'published' : normalized.status;

  await setDoc(doc(db, ...APP_UPDATES_PATH), {
    [platform]: {
      ...normalized,
      downloadUrl: resolvedDownloadUrl,
      status,
      publishedAt: publish ? serverTimestamp() : normalized.publishedAt,
      updatedAt: serverTimestamp()
    }
  }, { merge: true });
};

export const publishDetectedAndroidRelease = async (release) => {
  if (!release?.version || !isValidVersion(release.version)) throw new Error('La release detectada no tiene una versión válida.');
  if (!release?.android?.url) throw new Error('La release detectada no contiene app-release.apk.');

  await setDoc(doc(db, ...APP_UPDATES_PATH), {
    android: {
      latestVersion: release.version,
      minimumVersion: release.version,
      downloadUrl: release.android.url,
      forceUpdate: true,
      releaseNotes: String(release.releaseNotes || '').trim(),
      releaseTag: String(release.tagName || `v${release.version}`),
      releaseUrl: String(release.releaseUrl || ''),
      assetName: String(release.android.name || 'app-release.apk'),
      status: 'published',
      publishedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }
  }, { merge: true });
};
