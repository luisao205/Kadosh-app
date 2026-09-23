'use strict';

const isKadoshAppUrl = (url) => {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'kadosh:' && parsed.hostname === 'app' && parsed.port === '';
  } catch {
    return false;
  }
};

const createRendererTrustPolicy = ({ isDevelopment, developmentServerUrl }) => {
  let developmentOrigin = null;
  if (isDevelopment) {
    try {
      developmentOrigin = new URL(developmentServerUrl).origin;
    } catch {
      throw new Error('developmentServerUrl must be a valid URL.');
    }
  }

  const isTrustedRendererUrl = (url) => {
    if (!isDevelopment) return isKadoshAppUrl(url);
    try {
      return new URL(url).origin === developmentOrigin;
    } catch {
      return false;
    }
  };

  return { developmentOrigin, isTrustedRendererUrl };
};

module.exports = { isKadoshAppUrl, createRendererTrustPolicy };
