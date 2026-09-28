import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { compareVersions, isValidVersion } from './versioning';

export const APP_UPDATES_DOC = 'appUpdates';
export const APP_UPDATES_PATH = ['sistema', APP_UPDATES_DOC];
export const UPDATE_STATUSES = ['draft', 'testing', 'published'];

const normalizePlatformUpdate = (value = {}) => ({
  latestVersion: String(value.latestVersion || '').trim(),
  minimumVersion: String(value.minimumVersion || '').trim(),
  downloadUrl: String(value.downloadUrl || value.apkUrl || '').trim(),
  forceUpdate: value.forceUpdate === true,
  releaseNotes: String(value.releaseNotes || '').trim(),
  status: UPDATE_STATUSES.includes(value.status) ? value.status : 'draft',
  publishedAt: value.publishedAt || null,
  updatedAt: value.updatedAt || null
});

export const normalizeAppUpdates = (value = {}) => ({
  windows: normalizePlatformUpdate(value.windows),
  android: normalizePlatformUpdate(value.android)
});

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

  const status = publish ? 'published' : normalized.status;
  await setDoc(doc(db, ...APP_UPDATES_PATH), {
    [platform]: {
      ...normalized,
      status,
      publishedAt: publish ? serverTimestamp() : normalized.publishedAt,
      updatedAt: serverTimestamp()
    }
  }, { merge: true });
};
