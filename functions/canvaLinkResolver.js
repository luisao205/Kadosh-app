/* global module */

const allowedCanvaHost = (hostname) => {
  const host = String(hostname || '').toLowerCase();
  return host === 'canva.link' || host === 'canva.com' || host.endsWith('.canva.com');
};

const extractCanvaUrlCandidate = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const iframeMatch = raw.match(/<iframe[^>]*\bsrc=(['"])(.*?)\1/i);
  return String(iframeMatch?.[2] || raw).replace(/&amp;/g, '&').trim();
};

const normalizeCanvaDesignViewUrl = (value) => {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (!(host === 'canva.com' || host.endsWith('.canva.com'))) return '';
    if (!url.pathname.includes('/design/')) return '';

    if (url.pathname.endsWith('/edit')) {
      url.pathname = url.pathname.slice(0, -5) + '/view';
    } else if (!url.pathname.endsWith('/view')) {
      return '';
    }

    url.hash = '';
    return url.toString();
  } catch {
    return '';
  }
};

const isCanvaDesignView = (value) => Boolean(normalizeCanvaDesignViewUrl(value));

const toEmbedUrl = (value) => {
  const normalized = normalizeCanvaDesignViewUrl(value);
  if (!normalized) return '';
  const url = new URL(normalized);
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
    const candidate = normalizeCanvaDesignViewUrl(String(raw || '').trim());
    if (candidate) return candidate;
  }
  return '';
};

const extractDesignUrlFromHtml = (html) => {
  const decoded = decodeHtmlPayload(html).slice(0, 1500000);
  const absolute = decoded.match(/https:\/\/(?:www\.)?canva\.com\/design\/[^\s"'<>]+\/(?:view|edit)(?:\?[^\s"'<>]*)?/gi) || [];
  const direct = firstValidDesignUrl(absolute);
  if (direct) return direct;

  const relative = decoded.match(/\/design\/[^\s"'<>]+\/(?:view|edit)(?:\?[^\s"'<>]*)?/gi) || [];
  const relativeCandidates = relative.map((path) => 'https://www.canva.com' + path);
  const relativeDirect = firstValidDesignUrl(relativeCandidates);
  if (relativeDirect) return relativeDirect;

  const encoded = decoded.match(/https%3a%2f%2f(?:www\.)?canva\.com%2fdesign%2f[^\s"'<>]+%2f(?:view|edit)[^\s"'<>]*/gi) || [];
  for (const item of encoded) {
    try {
      const candidate = normalizeCanvaDesignViewUrl(decodeURIComponent(item));
      if (candidate) return candidate;
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
    const normalizedCurrent = normalizeCanvaDesignViewUrl(current.toString());
    if (normalizedCurrent) return normalizedCurrent;

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

const resolveCanvaInput = async (value, { resolveShortLink = resolveCanvaShortLink } = {}) => {
  const candidate = extractCanvaUrlCandidate(value);
  if (!candidate || candidate.length > 2048) throw new Error('Invalid Canva URL.');

  let input;
  try {
    input = new URL(candidate);
  } catch {
    throw new Error('Invalid Canva URL.');
  }

  const direct = normalizeCanvaDesignViewUrl(input.toString());
  if (direct) {
    const directUrl = new URL(direct);
    if (!directUrl.pathname.endsWith('/view')) throw new Error('Canva URL must be a public view.');
    return { sourceUrl: direct, embedUrl: toEmbedUrl(direct) };
  }

  if (input.hostname.toLowerCase() !== 'canva.link') {
    throw new Error('Only Canva public views and canva.link URLs are allowed.');
  }

  const sourceUrl = await resolveShortLink(input.toString());
  const embedUrl = toEmbedUrl(sourceUrl);
  if (!embedUrl) throw new Error('Canva URL is not embeddable.');
  return { sourceUrl, embedUrl };
};

const createCanvaLinkResolver = ({ functions }) => functions.https.onCall(async (data, context) => {
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

module.exports = createCanvaLinkResolver;
module.exports.resolveCanvaInput = resolveCanvaInput;
module.exports.normalizeCanvaDesignViewUrl = normalizeCanvaDesignViewUrl;
