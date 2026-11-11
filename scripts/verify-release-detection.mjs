import assert from 'node:assert/strict';
import { isValidVersion, compareVersions } from '../src/utils/versioning.js';

const GITHUB_RELEASES_BASE = 'https://github.com/luisao205/Kadosh-app/releases/download';

const getAndroidReleaseApkUrl = (version) => {
  const normalizedVersion = String(version || '').trim().replace(/^v/i, '');
  if (!isValidVersion(normalizedVersion)) return '';
  return `${GITHUB_RELEASES_BASE}/v${normalizedVersion}/app-release.apk`;
};

const normalizeReleaseAsset = (asset) => asset ? {
  name: String(asset.name || ''),
  url: String(asset.browser_download_url || ''),
  size: Number(asset.size || 0),
  digest: String(asset.digest || '')
} : null;

const normalizeGitHubRelease = (release = {}) => {
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

const getUpdateDecision = ({ installedVersion, config }) => {
  if (config.status !== 'published' || !isValidVersion(installedVersion) || !isValidVersion(config.latestVersion)) {
    return { available: false, required: false, config };
  }

  const latestComparison = compareVersions(installedVersion, config.latestVersion);
  const minimumValid = isValidVersion(config.minimumVersion);
  const minimumComparison = minimumValid ? compareVersions(installedVersion, config.minimumVersion) : null;
  const available = latestComparison === -1;
  const required = available && (
    config.forceUpdate
    || (minimumValid && minimumComparison === -1)
  );

  return { available, required, config };
};

const mockRelease = {
  id: 12345678,
  tag_name: 'v1.1.12',
  name: 'Kadosh App 1.1.12',
  body: 'Actualización estable Kadosh 1.1.12 con Projection V2 + V2.1',
  published_at: '2026-11-08T13:30:00Z',
  html_url: 'https://github.com/luisao205/Kadosh-app/releases/tag/v1.1.12',
  assets: [
    {
      name: 'app-release.apk',
      browser_download_url: 'https://github.com/luisao205/Kadosh-app/releases/download/v1.1.12/app-release.apk',
      size: 30255713
    },
    {
      name: 'Kadosh-App-Setup-1.1.12.exe',
      browser_download_url: 'https://github.com/luisao205/Kadosh-app/releases/download/v1.1.12/Kadosh-App-Setup-1.1.12.exe',
      size: 158876099
    },
    {
      name: 'latest.yml',
      browser_download_url: 'https://github.com/luisao205/Kadosh-app/releases/download/v1.1.12/latest.yml',
      size: 352
    }
  ]
};

const normalized = normalizeGitHubRelease(mockRelease);

assert.equal(normalized.version, '1.1.12');
assert.equal(normalized.tagName, 'v1.1.12');
assert.ok(normalized.android, 'Must detect android asset');
assert.equal(normalized.android.name, 'app-release.apk');
assert.equal(normalized.android.url, 'https://github.com/luisao205/Kadosh-app/releases/download/v1.1.12/app-release.apk');
assert.ok(normalized.windows, 'Must detect windows asset');
assert.equal(normalized.windows.name, 'Kadosh-App-Setup-1.1.12.exe');
assert.equal(normalized.windows.url, 'https://github.com/luisao205/Kadosh-app/releases/download/v1.1.12/Kadosh-App-Setup-1.1.12.exe');

const decisionAndroid = getUpdateDecision({
  installedVersion: '1.1.11',
  config: {
    status: 'published',
    latestVersion: '1.1.12',
    minimumVersion: '1.1.12',
    downloadUrl: normalized.android.url,
    forceUpdate: true
  }
});
assert.equal(decisionAndroid.available, true);
assert.equal(decisionAndroid.required, true);

const decisionUpdated = getUpdateDecision({
  installedVersion: '1.1.12',
  config: {
    status: 'published',
    latestVersion: '1.1.12',
    minimumVersion: '1.1.12',
    downloadUrl: normalized.android.url,
    forceUpdate: true
  }
});
assert.equal(decisionUpdated.available, false);
assert.equal(decisionUpdated.required, false);

assert.equal(getAndroidReleaseApkUrl('1.1.12'), 'https://github.com/luisao205/Kadosh-app/releases/download/v1.1.12/app-release.apk');

console.log('Release detection & update decision verification: PASS');
