'use strict';

const fs = require('node:fs');
const path = require('node:path');

const APP_SCHEME = 'kadosh';
const APP_HOST = 'app';
const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}/`;

const isPathInsideDirectory = (directory, candidate) => {
  const relative = path.relative(directory, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
};

const readHeader = (headers, name) => {
  if (!headers) return '';
  if (typeof headers.get === 'function') return headers.get(name) || '';
  return headers[name] || headers[name.toLowerCase()] || '';
};

const isSpaNavigation = (relativePath, headers) => {
  if (!relativePath || path.extname(relativePath)) return false;

  const accept = readHeader(headers, 'accept').toLowerCase();
  const destination = readHeader(headers, 'sec-fetch-dest').toLowerCase();
  return accept.includes('text/html') || destination === 'document';
};

const invalidPathResult = (reason) => ({ kind: 'not-found', reason });

const getRawPathname = (requestUrl) => {
  const schemeDelimiter = requestUrl.indexOf('://');
  if (schemeDelimiter === -1) return '';

  const authorityAndPath = requestUrl.slice(schemeDelimiter + 3);
  const pathStart = authorityAndPath.search(/[/?#]/);
  if (pathStart === -1 || authorityAndPath[pathStart] !== '/') return '/';
  return authorityAndPath.slice(pathStart).split(/[?#]/, 1)[0];
};

const resolveProductionRendererRequest = (requestUrl, {
  distDirectory = path.resolve(__dirname, '..', 'dist'),
  headers
} = {}) => {
  let url;
  try {
    url = new URL(requestUrl);
  } catch {
    return invalidPathResult('invalid-url');
  }

  if (
    url.protocol !== `${APP_SCHEME}:`
    || url.hostname !== APP_HOST
    || url.port
    || url.username
    || url.password
  ) {
    return invalidPathResult('invalid-origin');
  }

  let rawPathname;
  try {
    rawPathname = decodeURIComponent(getRawPathname(requestUrl));
  } catch {
    return invalidPathResult('invalid-encoding');
  }

  if (rawPathname.includes('\\') || rawPathname.includes('\0') || rawPathname.includes(':')) {
    return invalidPathResult('unsafe-path');
  }

  if (rawPathname.split('/').some((segment) => segment === '.' || segment === '..')) {
    return invalidPathResult('path-traversal');
  }

  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return invalidPathResult('invalid-encoding');
  }

  if (pathname.includes('\\') || pathname.includes('\0') || pathname.includes(':')) {
    return invalidPathResult('unsafe-path');
  }

  const relativePath = pathname.replace(/^\/+/, '');
  const segments = relativePath.split('/').filter(Boolean);
  if (segments.some((segment) => segment === '.' || segment === '..')) {
    return invalidPathResult('path-traversal');
  }

  const normalizedDistDirectory = path.resolve(distDirectory);
  const candidatePath = path.resolve(normalizedDistDirectory, relativePath || 'index.html');
  if (!isPathInsideDirectory(normalizedDistDirectory, candidatePath)) {
    return invalidPathResult('path-traversal');
  }

  if (fs.existsSync(candidatePath) && fs.statSync(candidatePath).isFile()) {
    return { kind: 'file', filePath: candidatePath };
  }

  if (!isSpaNavigation(relativePath, headers)) {
    return invalidPathResult('missing-asset');
  }

  const indexPath = path.join(normalizedDistDirectory, 'index.html');
  if (!fs.existsSync(indexPath) || !fs.statSync(indexPath).isFile()) {
    return invalidPathResult('missing-index');
  }

  return { kind: 'spa-fallback', filePath: indexPath };
};

module.exports = {
  APP_SCHEME,
  APP_HOST,
  APP_ORIGIN,
  isPathInsideDirectory,
  resolveProductionRendererRequest
};
