import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const resolverPath = 'functions/canvaLinkResolver.js';
if (!fs.existsSync(resolverPath)) throw new Error('No existe functions/canvaLinkResolver.js.');
const previous = fs.readFileSync(resolverPath, 'utf8');

const resolver = String.raw`/* global module */

const allowedCanvaHost = (hostname) => {
  const host = String(hostname || '').toLowerCase();
  return host === 'canva.link' || host === 'canva.com' || host.endsWith('.canva.com');
};

const isCanvaDesignView = (value) => {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return (host === 'canva.com' || host.endsWith('.canva.com'))
      && url.pathname.includes('/design/')
      && url.pathname.includes('/view');
  } catch {
    return false;
  }
};

const toEmbedUrl = (value) => {
  if (!isCanvaDesignView(value)) return '';
  const url = new URL(value);
  url.hash = '';
  url.search = '?embed';
  return url.toString();
};

const decodeHtmlPayload = (value) => String(value || '')
  .replace(/\\u002f/gi, '/')
  .replace(/\\u0026/gi, '&')
  .replace(/\\\//g, '/')
  .replace(/&amp;/gi, '&')
  .replace(/&quot;/gi, '"')
  .replace(/&#x2f;/gi, '/');

const firstValidDesignUrl = (candidates) => {
  for (const raw of candidates) {
    const candidate = String(raw || '').trim();
    if (isCanvaDesignView(candidate)) return candidate;
  }
  return '';
};

const extractDesignUrlFromHtml = (html) => {
  const decoded = decodeHtmlPayload(html).slice(0, 1500000);
  const absolute = decoded.match(/https:\/\/(?:www\.)?canva\.com\/design\/[^\s"'<>]+\/view(?:\?[^\s"'<>]*)?/gi) || [];
  const direct = firstValidDesignUrl(absolute);
  if (direct) return direct;

  const relative = decoded.match(/\/design\/[^\s"'<>]+\/view(?:\?[^\s"'<>]*)?/gi) || [];
  const relativeCandidates = relative.map((path) => 'https://www.canva.com' + path);
  const relativeDirect = firstValidDesignUrl(relativeCandidates);
  if (relativeDirect) return relativeDirect;

  const encoded = decoded.match(/https%3a%2f%2f(?:www\.)?canva\.com%2fdesign%2f[^\s"'<>]+%2fview[^\s"'<>]*/gi) || [];
  for (const item of encoded) {
    try {
      const candidate = decodeURIComponent(item);
      if (isCanvaDesignView(candidate)) return candidate;
    } catch {}
  }

  return '';
};

const fetchCanvaPage = async (url) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);
  try {
    return await fetch(url, {
      method: 'GET',
      redirect: 'manual',
      signal: controller.signal,
      headers: {
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'es-ES,es;q=0.9,en;q=0.8',
      },
    });
  } finally {
    clearTimeout(timeout);
  }
};

const resolveCanvaShortLink = async (initialUrl) => {
  let current = new URL(initialUrl);

  for (let hop = 0; hop < 8; hop += 1) {
    if (!allowedCanvaHost(current.hostname)) throw new Error('Dominio de redirección no permitido.');
    if (isCanvaDesignView(current.toString())) return current.toString();

    const response = await fetchCanvaPage(current.toString());
    const location = response.headers.get('location');

    if (response.status >= 300 && response.status < 400 && location) {
      try { await response.body?.cancel(); } catch {}
      const next = new URL(location, current);
      if (!allowedCanvaHost(next.hostname)) throw new Error('Canva redirigió fuera de sus dominios.');
      current = next;
      continue;
    }

    const html = await response.text();
    const extracted = extractDesignUrlFromHtml(html);
    if (extracted) return extracted;

    const refresh = response.headers.get('refresh') || '';
    const refreshMatch = refresh.match(/url\s*=\s*(.+)$/i);
    if (refreshMatch && refreshMatch[1]) {
      const nextValue = refreshMatch[1].trim().replace(/^["']|["']$/g, '');
      const next = new URL(nextValue, current);
      if (!allowedCanvaHost(next.hostname)) throw new Error('Canva redirigió fuera de sus dominios.');
      current = next;
      continue;
    }

    break;
  }

  throw new Error('El enlace corto no expuso una vista pública de diseño Canva.');
};

module.exports = ({ functions }) => functions.https.onCall(async (data, context) => {
  if (!context.auth || !context.auth.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Debes iniciar sesión.');
  }

  const raw = String((data && data.url) || '').trim();
  if (!raw || raw.length > 2048) {
    throw new functions.https.HttpsError('invalid-argument', 'Enlace de Canva inválido.');
  }

  let input;
  try {
    input = new URL(raw);
  } catch {
    throw new functions.https.HttpsError('invalid-argument', 'Enlace de Canva inválido.');
  }

  if (input.hostname.toLowerCase() !== 'canva.link') {
    throw new functions.https.HttpsError('invalid-argument', 'Solo se resuelven enlaces cortos canva.link.');
  }

  try {
    const sourceUrl = await resolveCanvaShortLink(input.toString());
    const embedUrl = toEmbedUrl(sourceUrl);
    if (!embedUrl) throw new Error('El destino no es una vista pública incrustable de Canva.');
    return { sourceUrl, embedUrl };
  } catch (error) {
    console.error('Error resolviendo canva.link:', error);
    throw new functions.https.HttpsError('failed-precondition', 'No se pudo convertir este enlace corto de Canva a una presentación incrustable.');
  }
});
`;

try {
  fs.writeFileSync(resolverPath, resolver, 'utf8');
  const check = spawnSync(process.execPath, ['--check', resolverPath], { encoding: 'utf8' });
  if (check.status !== 0) throw new Error(check.stderr || 'El resolver no pasó node --check.');
  console.log('Fix Canva v6 aplicado: resolver válido; node --check OK.');
} catch (error) {
  fs.writeFileSync(resolverPath, previous, 'utf8');
  throw error;
}
